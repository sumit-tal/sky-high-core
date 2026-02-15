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
 * Hold Expiry Integration Test.
 * Validates that a seat hold is released after the TTL expires.
 *
 * NOTE: To keep test runtime reasonable, we manipulate the held_at timestamp
 * in the DB and the Redis key TTL rather than waiting the full 120 seconds.
 */
describe("Hold Expiry (Integration)", () => {
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

  describe("When a seat hold expires", () => {
    it("Then the seat is released back to AVAILABLE", async () => {
      const passengerId = TEST_PASSENGER_IDS[0];
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      const token = getAuthToken(passengerId);
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      expect(holdRes.body.status).toBe("IN_PROGRESS");
      // Simulate hold expiry by backdating held_at and deleting the Redis key
      const pastTime = new Date(Date.now() - 130 * 1000);
      await dataSource.query(
        `UPDATE seat SET held_at = $1 WHERE id = $2`,
        [pastTime, seatId],
      );
      // Delete the Redis hold key to simulate TTL expiry
      const { RedisService } = await import("../../src/common/redis");
      const redisService = ctx.module.get(RedisService);
      await redisService.del(`hold:${seatId}`);
      // Trigger the background sweep manually
      const { HoldExpiryService } = await import(
        "../../src/check-in/hold-expiry.service"
      );
      const holdExpiryService = ctx.module.get(HoldExpiryService);
      await holdExpiryService.sweepExpiredHolds();
      // Wait a moment for async event processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Verify seat is now AVAILABLE
      const seatMapRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const seat = (
        seatMapRes.body.seats as Array<{ id: string; status: string }>
      ).find((s) => s.id === seatId);
      expect(seat).toBeDefined();
      expect(seat!.status).toBe("AVAILABLE");
      // Verify check-in is CANCELLED
      const checkInId = holdRes.body.id as string;
      const checkInRes = await request(app.getHttpServer())
        .get(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(checkInRes.body.status).toBe("CANCELLED");
    });
  });
});
