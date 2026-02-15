import { INestApplication } from "@nestjs/common";
import { App } from "supertest/types";
import * as request from "supertest";
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getAuthToken,
  getAvailableSeatId,
  TEST_FLIGHT_ID,
  TEST_PASSENGER_IDS,
} from "./setup";

describe("Concurrent Seat Hold (Integration)", () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof setupIntegrationTest>>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
    app = ctx.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(ctx);
  });

  describe("When N parallel requests target the same seat", () => {
    it("Then exactly one succeeds with 201 and all others get 409", async () => {
      const seatId = await getAvailableSeatId(
        app,
        TEST_PASSENGER_IDS[0],
        TEST_FLIGHT_ID,
      );
      const concurrentCount = 5;
      const passengers = TEST_PASSENGER_IDS.slice(0, concurrentCount);
      const promises = passengers.map((passengerId) => {
        const token = getAuthToken(passengerId);
        return request(app.getHttpServer())
          .post("/api/v1/check-ins")
          .set("Authorization", `Bearer ${token}`)
          .send({ flightId: TEST_FLIGHT_ID, seatId });
      });
      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(concurrentCount - 1);
      expect(successes[0].body.status).toBe("IN_PROGRESS");
      expect(successes[0].body.seatId).toBe(seatId);
      for (const conflict of conflicts) {
        expect(conflict.body.type).toContain("seat-already-held");
        expect(conflict.body.status).toBe(409);
      }
    });
  });

  describe("When two passengers try to hold different seats concurrently", () => {
    it("Then both succeed with 201", async () => {
      const seatId1 = await getAvailableSeatId(
        app,
        TEST_PASSENGER_IDS[5],
        TEST_FLIGHT_ID,
      );
      const token1 = getAuthToken(TEST_PASSENGER_IDS[5]);
      const res1 = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token1}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId: seatId1 });
      const seatId2 = await getAvailableSeatId(
        app,
        TEST_PASSENGER_IDS[6],
        TEST_FLIGHT_ID,
      );
      const token2 = getAuthToken(TEST_PASSENGER_IDS[6]);
      const res2 = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token2}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId: seatId2 });
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.seatId).toBe(seatId1);
      expect(res2.body.seatId).toBe(seatId2);
    });
  });
});
