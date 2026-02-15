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

describe("Full Check-In Flow (Integration)", () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof setupIntegrationTest>>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
    app = ctx.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(ctx);
  });

  describe("When hold seat → add baggage (under limit) → confirm", () => {
    it("Then check-in status is COMPLETED", async () => {
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
      expect(holdRes.body.seatId).toBe(seatId);
      expect(holdRes.body.holdExpiresAt).toBeDefined();
      // Step 2: Confirm with baggage under limit (20kg < 25kg)
      const confirmRes = await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ baggageWeight: 20, action: "CONFIRM" })
        .expect(200);
      expect(confirmRes.body.status).toBe("COMPLETED");
      expect(confirmRes.body.id).toBe(checkInId);
      // Step 3: Verify seat is CONFIRMED
      const seatMapRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const seat = (
        seatMapRes.body.seats as Array<{ id: string; status: string }>
      ).find((s) => s.id === seatId);
      expect(seat).toBeDefined();
      expect(seat!.status).toBe("CONFIRMED");
      // Step 4: Verify check-in GET returns COMPLETED
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(getRes.body.status).toBe("COMPLETED");
    });
  });

  describe("When confirming with zero baggage weight", () => {
    it("Then check-in completes successfully", async () => {
      const passengerId = TEST_PASSENGER_IDS[1];
      const token = getAuthToken(passengerId);
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      const confirmRes = await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ action: "CONFIRM" })
        .expect(200);
      expect(confirmRes.body.status).toBe("COMPLETED");
    });
  });
});
