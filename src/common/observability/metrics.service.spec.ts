import { Test, TestingModule } from "@nestjs/testing";
import { register } from "prom-client";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(async () => {
    register.clear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    register.clear();
  });

  describe("When instantiated", () => {
    it("Then seatMapRequestsTotal is defined as a Counter", () => {
      expect(service.seatMapRequestsTotal).toBeDefined();
      expect(typeof service.seatMapRequestsTotal.inc).toBe("function");
    });

    it("Then seatHoldDurationSeconds is defined as a Histogram", () => {
      expect(service.seatHoldDurationSeconds).toBeDefined();
      expect(typeof service.seatHoldDurationSeconds.observe).toBe("function");
    });

    it("Then seatContentionTotal is defined as a Counter", () => {
      expect(service.seatContentionTotal).toBeDefined();
      expect(typeof service.seatContentionTotal.inc).toBe("function");
    });

    it("Then holdExpiryTotal is defined as a Counter", () => {
      expect(service.holdExpiryTotal).toBeDefined();
      expect(typeof service.holdExpiryTotal.inc).toBe("function");
    });

    it("Then checkinDurationSeconds is defined as a Histogram", () => {
      expect(service.checkinDurationSeconds).toBeDefined();
      expect(typeof service.checkinDurationSeconds.observe).toBe("function");
    });

    it("Then waitlistDepth is defined as a Gauge", () => {
      expect(service.waitlistDepth).toBeDefined();
      expect(typeof service.waitlistDepth.set).toBe("function");
    });

    it("Then waitlistAssignmentTotal is defined as a Counter", () => {
      expect(service.waitlistAssignmentTotal).toBeDefined();
      expect(typeof service.waitlistAssignmentTotal.inc).toBe("function");
    });

    it("Then abuseEventsTotal is defined as a Counter", () => {
      expect(service.abuseEventsTotal).toBeDefined();
      expect(typeof service.abuseEventsTotal.inc).toBe("function");
    });

    it("Then paymentRequestDurationSeconds is defined as a Histogram", () => {
      expect(service.paymentRequestDurationSeconds).toBeDefined();
      expect(typeof service.paymentRequestDurationSeconds.observe).toBe("function");
    });

    it("Then httpRequestDurationSeconds is defined as a Histogram", () => {
      expect(service.httpRequestDurationSeconds).toBeDefined();
      expect(typeof service.httpRequestDurationSeconds.observe).toBe("function");
    });
  });

  describe("When metrics are used", () => {
    it("Then seatMapRequestsTotal can be incremented with labels", () => {
      expect(() =>
        service.seatMapRequestsTotal.labels({ flight_id: "f1", status: "success" }).inc(),
      ).not.toThrow();
    });

    it("Then seatHoldDurationSeconds can observe values with labels", () => {
      expect(() =>
        service.seatHoldDurationSeconds.labels({ flight_id: "f1" }).observe(60),
      ).not.toThrow();
    });

    it("Then waitlistDepth can be set with labels", () => {
      expect(() =>
        service.waitlistDepth.labels({ flight_id: "f1" }).set(5),
      ).not.toThrow();
    });

    it("Then httpRequestDurationSeconds can observe values with labels", () => {
      expect(() =>
        service.httpRequestDurationSeconds
          .labels({ method: "GET", path: "/api/v1/flights", status: "200" })
          .observe(0.15),
      ).not.toThrow();
    });
  });

  describe("When instantiated twice", () => {
    it("Then reuses existing metrics (no duplicate registration error)", async () => {
      const module2: TestingModule = await Test.createTestingModule({
        providers: [MetricsService],
      }).compile();
      const service2 = module2.get<MetricsService>(MetricsService);
      expect(service2.seatMapRequestsTotal).toBeDefined();
      expect(() =>
        service2.seatMapRequestsTotal.labels({ flight_id: "f1", status: "success" }).inc(),
      ).not.toThrow();
    });
  });
});
