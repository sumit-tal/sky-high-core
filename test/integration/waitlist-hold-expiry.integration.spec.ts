import { INestApplication } from "@nestjs/common";
import { App } from "supertest/types";
import * as request from "supertest";
import { DataSource } from "typeorm";
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getAuthToken,
  getAvailableSeatId,
  TEST_FLIGHT_ID,
  TEST_PASSENGER_IDS,
} from "./setup";

/**
 * Waitlist Hold Expiry Integration Test.
 * Validates that when a waitlist-assigned hold expires,
 * the seat goes back to the next FIFO passenger (not general availability).
 */
describe("Waitlist Hold Expiry (Integration)", () => {
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

  describe("When a waitlist-assigned hold expires", () => {
    it("Then the next FIFO passenger gets the seat", async () => {
      const passenger1 = TEST_PASSENGER_IDS[0];
      const passenger2 = TEST_PASSENGER_IDS[1];
      const passenger3 = TEST_PASSENGER_IDS[2];
      const token1 = getAuthToken(passenger1);
      const token2 = getAuthToken(passenger2);
      const token3 = getAuthToken(passenger3);
      // Passenger 1 holds a seat and confirms
      const seatId = await getAvailableSeatId(app, passenger1, TEST_FLIGHT_ID);
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token1}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ baggageWeight: 10, action: "CONFIRM" })
        .expect(200);
      // Passengers 2 and 3 join waitlist (FIFO order: 2 then 3)
      await request(app.getHttpServer())
        .post(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
        .set("Authorization", `Bearer ${token2}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
        .set("Authorization", `Bearer ${token3}`)
        .expect(201);
      // Passenger 1 cancels → seat goes to passenger 2 (FIFO first)
      await request(app.getHttpServer())
        .delete(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token1}`)
        .expect(200);
      // Wait for waitlist auto-assignment
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Verify passenger 2 got ASSIGNED
      const waitlistRes1 = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
        .set("Authorization", `Bearer ${token2}`)
        .expect(200);
      const entry2 = (
        waitlistRes1.body as Array<{
          passengerId: string;
          status: string;
        }>
      ).find((e) => e.passengerId === passenger2);
      expect(entry2).toBeDefined();
      expect(entry2!.status).toBe("ASSIGNED");
      // Now simulate passenger 2's hold expiring
      // Find the seat that was assigned to passenger 2
      const assignedSeat = await dataSource.query(
        `SELECT id FROM seat WHERE flight_id = $1 AND held_by = $2 AND status = 'HELD'`,
        [TEST_FLIGHT_ID, passenger2],
      );
      if (assignedSeat.length > 0) {
        const assignedSeatId = assignedSeat[0].id as string;
        // Backdate held_at to simulate expiry
        const pastTime = new Date(Date.now() - 130 * 1000);
        await dataSource.query(
          `UPDATE seat SET held_at = $1 WHERE id = $2`,
          [pastTime, assignedSeatId],
        );
        // Delete Redis hold key
        const { RedisService } = await import("../../src/common/redis");
        const redisService = ctx.module.get(RedisService);
        await redisService.del(`hold:${assignedSeatId}`);
        // Trigger sweep
        const { HoldExpiryService } = await import(
          "../../src/check-in/hold-expiry.service"
        );
        const holdExpiryService = ctx.module.get(HoldExpiryService);
        await holdExpiryService.sweepExpiredHolds();
        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 1500));
        // Verify passenger 2's waitlist entry is EXPIRED
        const waitlistRes2 = await request(app.getHttpServer())
          .get(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
          .set("Authorization", `Bearer ${token2}`)
          .expect(200);
        const expiredEntry = (
          waitlistRes2.body as Array<{
            passengerId: string;
            status: string;
          }>
        ).find(
          (e) => e.passengerId === passenger2 && e.status === "EXPIRED",
        );
        expect(expiredEntry).toBeDefined();
        // Verify passenger 3 got ASSIGNED (next FIFO)
        const entry3 = (
          waitlistRes2.body as Array<{
            passengerId: string;
            status: string;
          }>
        ).find((e) => e.passengerId === passenger3);
        expect(entry3).toBeDefined();
        expect(entry3!.status).toBe("ASSIGNED");
      }
    });
  });
});
