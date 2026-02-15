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
 * CAS Double-Release Integration Test.
 * Validates that triggering both keyspace notification and sweep
 * for the same seat results in only one release (at-most-once semantics).
 */
describe("CAS Double-Release (Integration)", () => {
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

  describe("When both keyspace notification and sweep fire for the same seat", () => {
    it("Then only one release occurs (at-most-once)", async () => {
      const passengerId = TEST_PASSENGER_IDS[0];
      const token = getAuthToken(passengerId);
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      // Hold the seat
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      expect(holdRes.body.status).toBe("IN_PROGRESS");
      // Simulate hold expiry by backdating held_at
      const pastTime = new Date(Date.now() - 130 * 1000);
      await dataSource.query(
        `UPDATE seat SET held_at = $1 WHERE id = $2`,
        [pastTime, seatId],
      );
      // Delete the Redis hold key
      const { RedisService } = await import("../../src/common/redis");
      const redisService = ctx.module.get(RedisService);
      await redisService.del(`hold:${seatId}`);
      // Trigger BOTH release mechanisms concurrently
      const { HoldExpiryService } = await import(
        "../../src/check-in/hold-expiry.service"
      );
      const holdExpiryService = ctx.module.get(HoldExpiryService);
      // Fire both the keyspace handler and the sweep simultaneously
      const [keyspaceResult, sweepResult] = await Promise.allSettled([
        holdExpiryService.handleHoldExpired({ seatId, key: `hold:${seatId}` }),
        holdExpiryService.releaseSeat(seatId),
      ]);
      // Both should resolve without errors
      expect(keyspaceResult.status).toBe("fulfilled");
      expect(sweepResult.status).toBe("fulfilled");
      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Verify seat is AVAILABLE (released exactly once)
      const seatMapRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const seat = (
        seatMapRes.body.seats as Array<{ id: string; status: string }>
      ).find((s) => s.id === seatId);
      expect(seat).toBeDefined();
      expect(seat!.status).toBe("AVAILABLE");
      // Verify only one SEAT_RELEASED audit log entry exists for this seat
      const auditLogs = await dataSource.query(
        `SELECT * FROM audit_log
         WHERE entity_id = $1 AND action = 'SEAT_RELEASED'
         ORDER BY created_at DESC`,
        [seatId],
      );
      expect(auditLogs.length).toBe(1);
    });
  });
});
