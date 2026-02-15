import { INestApplication } from "@nestjs/common";
import { App } from "supertest/types";
import * as request from "supertest";
import { DataSource } from "typeorm";
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getAuthToken,
  TEST_FLIGHT_ID,
  TEST_PASSENGER_IDS,
} from "./setup";

describe("Rate Limiter (Integration)", () => {
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

  describe("When sending more than 50 requests in 2 seconds", () => {
    it("Then a 429 response is returned and an abuse_event record is created", async () => {
      const passengerId = TEST_PASSENGER_IDS[0];
      const token = getAuthToken(passengerId);
      const requestCount = 55;
      const results: request.Response[] = [];
      // Fire requests sequentially to ensure they all hit the same window
      for (let i = 0; i < requestCount; i++) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
          .set("Authorization", `Bearer ${token}`);
        results.push(res);
      }
      const successResponses = results.filter((r) => r.status === 200);
      const rateLimitedResponses = results.filter((r) => r.status === 429);
      // At least some should be rate-limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      // First 50 should succeed (or close to it, depending on timing)
      expect(successResponses.length).toBeGreaterThanOrEqual(49);
      // Verify 429 response format (RFC 7807)
      const firstRateLimited = rateLimitedResponses[0];
      expect(firstRateLimited.body.type).toContain("rate-limit-exceeded");
      expect(firstRateLimited.body.status).toBe(429);
      expect(firstRateLimited.headers["retry-after"]).toBeDefined();
      // Verify abuse_event record was created in the database
      // Wait a moment for async persistence
      await new Promise((resolve) => setTimeout(resolve, 500));
      const abuseEvents = await dataSource.query(
        `SELECT * FROM abuse_event ORDER BY created_at DESC LIMIT 5`,
      );
      expect(abuseEvents.length).toBeGreaterThan(0);
      const latestEvent = abuseEvents[0] as {
        source_ip: string;
        request_count: number;
      };
      expect(latestEvent.source_ip).toBeDefined();
      expect(latestEvent.request_count).toBeGreaterThanOrEqual(50);
    });
  });

  describe("When sending requests under the limit", () => {
    it("Then all requests succeed with 200", async () => {
      const passengerId = TEST_PASSENGER_IDS[1];
      const token = getAuthToken(passengerId);
      // Wait for the rate limit window to reset
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const requestCount = 5;
      const results: request.Response[] = [];
      for (let i = 0; i < requestCount; i++) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/flights/${TEST_FLIGHT_ID}/seats`)
          .set("Authorization", `Bearer ${token}`);
        results.push(res);
      }
      const allSuccess = results.every((r) => r.status === 200);
      expect(allSuccess).toBe(true);
    });
  });
});
