import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Request, Response } from "express";
import { RateLimiterMiddleware } from "./rate-limiter.middleware";
import { RedisService } from "../redis";
import { MetricsService } from "../observability";
import { createMockMetricsService } from "../observability/metrics.service.mock";
import { AbuseEventService } from "../../audit/abuse-event.service";
import { RATE_LIMIT_EXCEEDED } from "../filters/error-types.constants";

const CLIENT_IP = "192.168.1.100";
const ENDPOINT = "/api/v1/flights/flight-uuid-1/seats";

const configMap: Record<string, string> = {
  RATE_LIMIT_WINDOW_MS: "2000",
  RATE_LIMIT_MAX_REQUESTS: "50",
};

const createMockRequest = (ip: string = CLIENT_IP): Partial<Request> => ({
  ip,
  socket: { remoteAddress: ip } as any,
  originalUrl: ENDPOINT,
  method: "GET",
});

const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as any,
    header: jest.fn().mockReturnThis() as any,
    json: jest.fn().mockReturnThis() as any,
  };
  return res;
};

describe("RateLimiterMiddleware", () => {
  let middleware: RateLimiterMiddleware;
  let redisService: jest.Mocked<RedisService>;
  let abuseEventService: jest.Mocked<AbuseEventService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterMiddleware,
        {
          provide: RedisService,
          useValue: {
            addRateLimitEntry: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, defaultValue: string) =>
                configMap[key] ?? defaultValue,
            ),
          },
        },
        {
          provide: AbuseEventService,
          useValue: {
            record: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: createMockMetricsService(),
        },
      ],
    }).compile();
    middleware = module.get<RateLimiterMiddleware>(RateLimiterMiddleware);
    redisService = module.get(RedisService);
    abuseEventService = module.get(AbuseEventService);
  });

  describe("use", () => {
    it("When request count is below limit, Then calls next()", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(10);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("When request count equals limit, Then returns 429", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(50);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(RATE_LIMIT_EXCEEDED.status);
    });

    it("When request count exceeds limit, Then returns 429 with RFC 7807 body", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(55);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.header).toHaveBeenCalledWith(
        "Content-Type",
        "application/problem+json",
      );
      expect(res.header).toHaveBeenCalledWith("Retry-After", "2");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RATE_LIMIT_EXCEEDED.type,
          title: RATE_LIMIT_EXCEEDED.title,
          status: 429,
          detail: "Rate limit exceeded, please try again later",
          instance: ENDPOINT,
        }),
      );
    });

    it("When rate limit exceeded, Then records abuse event", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(51);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(abuseEventService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIp: CLIENT_IP,
          requestCount: 51,
          details: expect.objectContaining({
            endpoint: ENDPOINT,
            method: "GET",
          }),
        }),
      );
    });

    it("When rate limit not exceeded, Then does not record abuse event", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(49);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(abuseEventService.record).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it("When request has no ip, Then falls back to socket.remoteAddress", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(5);
      const req: Partial<Request> = {
        ip: undefined,
        socket: { remoteAddress: "10.0.0.1" } as any,
        originalUrl: ENDPOINT,
        method: "GET",
      };
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(redisService.addRateLimitEntry).toHaveBeenCalledWith(
        "ratelimit:10.0.0.1",
        expect.any(Number),
        2000,
      );
      expect(next).toHaveBeenCalled();
    });

    it("When request count is exactly one below limit, Then calls next()", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(49);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("When Redis returns 0, Then calls next()", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(0);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("When called, Then uses correct Redis key format", async () => {
      redisService.addRateLimitEntry.mockResolvedValue(1);
      const req = createMockRequest("203.0.113.42");
      const res = createMockResponse();
      const next = jest.fn();
      await middleware.use(req as Request, res as Response, next);
      expect(redisService.addRateLimitEntry).toHaveBeenCalledWith(
        "ratelimit:203.0.113.42",
        expect.any(Number),
        2000,
      );
    });

    it("When window expires and count resets, Then allows request again", async () => {
      redisService.addRateLimitEntry.mockResolvedValueOnce(55);
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const next1 = jest.fn();
      await middleware.use(req1 as Request, res1 as Response, next1);
      expect(next1).not.toHaveBeenCalled();
      expect(res1.status).toHaveBeenCalledWith(429);
      redisService.addRateLimitEntry.mockResolvedValueOnce(1);
      const req2 = createMockRequest();
      const res2 = createMockResponse();
      const next2 = jest.fn();
      await middleware.use(req2 as Request, res2 as Response, next2);
      expect(next2).toHaveBeenCalled();
      expect(res2.status).not.toHaveBeenCalled();
    });
  });
});
