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

describe("Check-In with Payment (Integration)", () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof setupIntegrationTest>>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
    app = ctx.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(ctx);
  });

  describe("When hold seat → add overweight baggage → payment triggered → confirm", () => {
    it("Then check-in completes with payment and excess fee recorded", async () => {
      const passengerId = TEST_PASSENGER_IDS[0];
      const token = getAuthToken(passengerId);
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      // Step 1: Hold seat
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      expect(holdRes.body.status).toBe("IN_PROGRESS");
      // Step 2: Confirm with overweight baggage (30kg > 25kg limit)
      // Excess: 5kg × $10/kg = $50 fee
      // The stub payment service always returns "confirmed"
      const confirmRes = await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ baggageWeight: 30, action: "CONFIRM" })
        .expect(200);
      // Payment stub returns confirmed, so check-in should complete
      expect(confirmRes.body.status).toBe("COMPLETED");
      expect(confirmRes.body.id).toBe(checkInId);
      // Verify the check-in record has payment info
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(getRes.body.status).toBe("COMPLETED");
      expect(getRes.body.paymentId).toBeDefined();
      expect(getRes.body.paymentId).not.toBeNull();
    });
  });

  describe("When baggage is exactly at the limit", () => {
    it("Then no payment is triggered and check-in completes directly", async () => {
      const passengerId = TEST_PASSENGER_IDS[1];
      const token = getAuthToken(passengerId);
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      // 25kg is exactly the limit — no excess
      const confirmRes = await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ baggageWeight: 25, action: "CONFIRM" })
        .expect(200);
      expect(confirmRes.body.status).toBe("COMPLETED");
      // No payment ID should be set
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(getRes.body.paymentId).toBeNull();
    });
  });
});
