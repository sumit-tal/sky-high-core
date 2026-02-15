import { ExecutionContext, CallHandler } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { LoggingInterceptor } from "./logging.interceptor";
import { MetricsService } from "../observability/metrics.service";
import { createMockMetricsService } from "../observability/metrics.service.mock";

const createMockExecutionContext = (
  overrides: {
    method?: string;
    url?: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    user?: { sub?: string };
    route?: { path?: string };
    statusCode?: number;
  } = {},
): ExecutionContext => {
  const request = {
    method: overrides.method ?? "GET",
    url: overrides.url ?? "/api/v1/flights",
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    route: overrides.route ?? { path: "/api/v1/flights" },
  } as Record<string, unknown>;
  if (overrides.user) {
    request.user = overrides.user;
  }
  const response = {
    statusCode: overrides.statusCode ?? 200,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
};

const createMockCallHandler = (
  result: unknown = { data: "ok" },
): CallHandler => ({
  handle: () => of(result),
});

const createErrorCallHandler = (error: Error): CallHandler => ({
  handle: () => throwError(() => error),
});

describe("LoggingInterceptor", () => {
  let interceptor: LoggingInterceptor;
  let metricsService: jest.Mocked<MetricsService>;
  let mockObserve: jest.Mock;

  beforeEach(() => {
    metricsService = createMockMetricsService();
    mockObserve = jest.fn();
    metricsService.httpRequestDurationSeconds.labels = jest
      .fn()
      .mockReturnValue({ observe: mockObserve });
    interceptor = new LoggingInterceptor(metricsService);
  });

  describe("intercept", () => {
    it("When request completes successfully, Then records http duration metric", (done) => {
      const ctx = createMockExecutionContext({ statusCode: 200 });
      const next = createMockCallHandler();
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(metricsService.httpRequestDurationSeconds.labels).toHaveBeenCalledWith(
            expect.objectContaining({
              method: "GET",
              status: "200",
            }),
          );
          expect(mockObserve).toHaveBeenCalledWith(expect.any(Number));
          done();
        },
      });
    });

    it("When request fails, Then records http duration metric with error status", (done) => {
      const ctx = createMockExecutionContext({ statusCode: 500 });
      const next = createErrorCallHandler(new Error("Internal error"));
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(metricsService.httpRequestDurationSeconds.labels).toHaveBeenCalledWith(
            expect.objectContaining({
              method: "GET",
              status: "500",
            }),
          );
          expect(mockObserve).toHaveBeenCalled();
          done();
        },
      });
    });

    it("When request has flightId param, Then extracts domain field", (done) => {
      const ctx = createMockExecutionContext({
        params: { flightId: "flight-uuid-1" },
      });
      const next = createMockCallHandler();
      const logSpy = jest.spyOn(
        (interceptor as any).logger,
        "log",
      );
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.objectContaining({ flightId: "flight-uuid-1" }),
          );
          done();
        },
      });
    });

    it("When request has checkInId param, Then extracts domain field", (done) => {
      const ctx = createMockExecutionContext({
        params: { checkInId: "checkin-uuid-1" },
      });
      const next = createMockCallHandler();
      const logSpy = jest.spyOn(
        (interceptor as any).logger,
        "log",
      );
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.objectContaining({ checkInId: "checkin-uuid-1" }),
          );
          done();
        },
      });
    });

    it("When request body has seatId, Then extracts domain field", (done) => {
      const ctx = createMockExecutionContext({
        method: "POST",
        url: "/api/v1/check-ins",
        body: { flightId: "f1", seatId: "s1" },
        route: { path: "/api/v1/check-ins" },
      });
      const next = createMockCallHandler();
      const logSpy = jest.spyOn(
        (interceptor as any).logger,
        "log",
      );
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.objectContaining({ seatId: "s1" }),
          );
          done();
        },
      });
    });

    it("When request has authenticated user, Then extracts passengerId", (done) => {
      const ctx = createMockExecutionContext({
        user: { sub: "passenger-uuid-1" },
      });
      const next = createMockCallHandler();
      const logSpy = jest.spyOn(
        (interceptor as any).logger,
        "log",
      );
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.objectContaining({ passengerId: "passenger-uuid-1" }),
          );
          done();
        },
      });
    });

    it("When path contains UUID, Then normalizes it for metric label", (done) => {
      const ctx = createMockExecutionContext({
        url: "/api/v1/flights/a1b2c3d4-e5f6-7890-abcd-ef1234567890/seats",
        route: { path: "/api/v1/flights/a1b2c3d4-e5f6-7890-abcd-ef1234567890/seats" },
      });
      const next = createMockCallHandler();
      interceptor.intercept(ctx, next).subscribe({
        complete: () => {
          expect(metricsService.httpRequestDurationSeconds.labels).toHaveBeenCalledWith(
            expect.objectContaining({
              path: "/api/v1/flights/:id/seats",
            }),
          );
          done();
        },
      });
    });
  });
});
