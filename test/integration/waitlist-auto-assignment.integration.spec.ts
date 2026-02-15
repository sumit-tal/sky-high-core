import { INestApplication } from "@nestjs/common";
import { App } from "supertest/types";
import * as request from "supertest";
import { DataSource } from "typeorm";
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getAuthToken,
  TEST_FLIGHT_ID_2,
  TEST_PASSENGER_IDS,
} from "./setup";

/**
 * Waitlist Auto-Assignment Integration Test.
 * Uses TEST_FLIGHT_ID_2 to avoid conflicts with other test suites.
 * Simulates all seats being held, a passenger joining the waitlist,
 * then a seat expiring and being auto-assigned to the waitlisted passenger.
 */
describe("Waitlist Auto-Assignment (Integration)", () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof setupIntegrationTest>>;
  let dataSource: DataSource;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
    app = ctx.app;
    dataSource = ctx.dataSource;
  });

  afterAll(async () => {
    await teardownIntegrationTest(ctx);
  });

  describe("When all seats are held and a passenger joins waitlist then a seat expires", () => {
    it("Then the waitlisted passenger gets auto-assigned a seat", async () => {
      const holderPassenger = TEST_PASSENGER_IDS[0];
      const waitlistPassenger = TEST_PASSENGER_IDS[1];
      const holderToken = getAuthToken(holderPassenger);
      const waitlistToken = getAuthToken(waitlistPassenger);
      // Get an available seat and hold it
      const seatMapRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID_2}/seats`)
        .set("Authorization", `Bearer ${holderToken}`)
        .expect(200);
      const availableSeats = (
        seatMapRes.body.seats as Array<{ id: string; status: string }>
      ).filter((s) => s.status === "AVAILABLE");
      expect(availableSeats.length).toBeGreaterThan(0);
      const targetSeatId = availableSeats[0].id;
      // Hold the seat
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${holderToken}`)
        .send({ flightId: TEST_FLIGHT_ID_2, seatId: targetSeatId })
        .expect(201);
      expect(holdRes.body.status).toBe("IN_PROGRESS");
      // Mark ALL other seats as HELD in DB so no seats are available
      await dataSource.query(
        `UPDATE seat SET status = 'HELD', held_by = $1, held_at = NOW()
         WHERE flight_id = $2 AND status = 'AVAILABLE'`,
        [holderPassenger, TEST_FLIGHT_ID_2],
      );
      // Waitlist passenger joins
      const waitlistRes = await request(app.getHttpServer())
        .post(`/api/v1/flights/${TEST_FLIGHT_ID_2}/waitlist`)
        .set("Authorization", `Bearer ${waitlistToken}`)
        .expect(201);
      expect(waitlistRes.body.status).toBe("WAITING");
      const waitlistEntryId = waitlistRes.body.id as string;
      // Simulate hold expiry for the target seat by backdating held_at
      const pastTime = new Date(Date.now() - 130 * 1000);
      await dataSource.query(`UPDATE seat SET held_at = $1 WHERE id = $2`, [
        pastTime,
        targetSeatId,
      ]);
      // Delete the Redis hold key
      const { RedisService } = await import("../../src/common/redis");
      const redisService = ctx.module.get(RedisService);
      await redisService.del(`hold:${targetSeatId}`);
      // Trigger the background sweep
      const { HoldExpiryService } =
        await import("../../src/check-in/hold-expiry.service");
      const holdExpiryService = ctx.module.get(HoldExpiryService);
      await holdExpiryService.sweepExpiredHolds();
      // Wait for async event processing (waitlist assignment)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Verify waitlist entry is ASSIGNED
      const waitlistStatusRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID_2}/waitlist`)
        .set("Authorization", `Bearer ${waitlistToken}`)
        .expect(200);
      const entry = (
        waitlistStatusRes.body as Array<{
          id: string;
          status: string;
          passengerId: string;
        }>
      ).find((e) => e.id === waitlistEntryId);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe("ASSIGNED");
    });
  });
});
