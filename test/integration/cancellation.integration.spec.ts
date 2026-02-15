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

describe("Cancellation (Integration)", () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof setupIntegrationTest>>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
    app = ctx.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(ctx);
  });

  describe("When a completed check-in is cancelled", () => {
    it("Then the seat becomes AVAILABLE again", async () => {
      const passengerId = TEST_PASSENGER_IDS[0];
      const token = getAuthToken(passengerId);
      const seatId = await getAvailableSeatId(app, passengerId, TEST_FLIGHT_ID);
      // Hold and confirm
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ baggageWeight: 15, action: "CONFIRM" })
        .expect(200);
      // Cancel the check-in
      const cancelRes = await request(app.getHttpServer())
        .delete(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(cancelRes.body.status).toBe("CANCELLED");
      expect(cancelRes.body.cancelledAt).toBeDefined();
      // Wait for async event processing (waitlist trigger)
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Verify seat is AVAILABLE
      const seatMapRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const seat = (
        seatMapRes.body.seats as Array<{ id: string; status: string }>
      ).find((s) => s.id === seatId);
      expect(seat).toBeDefined();
      expect(seat!.status).toBe("AVAILABLE");
    });
  });

  describe("When cancellation triggers waitlist processing", () => {
    it("Then the next waitlisted passenger gets the seat", async () => {
      const passenger1 = TEST_PASSENGER_IDS[1];
      const passenger2 = TEST_PASSENGER_IDS[2];
      const token1 = getAuthToken(passenger1);
      const token2 = getAuthToken(passenger2);
      const seatId = await getAvailableSeatId(app, passenger1, TEST_FLIGHT_ID);
      // Passenger 1 holds a seat
      const holdRes = await request(app.getHttpServer())
        .post("/api/v1/check-ins")
        .set("Authorization", `Bearer ${token1}`)
        .send({ flightId: TEST_FLIGHT_ID, seatId })
        .expect(201);
      const checkInId = holdRes.body.id as string;
      // Confirm the check-in
      await request(app.getHttpServer())
        .patch(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ baggageWeight: 10, action: "CONFIRM" })
        .expect(200);
      // Passenger 2 joins waitlist
      const waitlistRes = await request(app.getHttpServer())
        .post(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
        .set("Authorization", `Bearer ${token2}`)
        .expect(201);
      expect(waitlistRes.body.status).toBe("WAITING");
      // Passenger 1 cancels — should trigger waitlist processing
      await request(app.getHttpServer())
        .delete(`/api/v1/check-ins/${checkInId}`)
        .set("Authorization", `Bearer ${token1}`)
        .expect(200);
      // Wait for async waitlist processing
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Verify waitlist entry is ASSIGNED
      const waitlistStatusRes = await request(app.getHttpServer())
        .get(`/api/v1/flights/${TEST_FLIGHT_ID}/waitlist`)
        .set("Authorization", `Bearer ${token2}`)
        .expect(200);
      const entry = (
        waitlistStatusRes.body as Array<{
          passengerId: string;
          status: string;
        }>
      ).find((e) => e.passengerId === passenger2);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe("ASSIGNED");
    });
  });
});
