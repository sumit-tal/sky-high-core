import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response, NextFunction } from "express";
import { RedisService, RedisKey } from "../redis";
import { MetricsService } from "../observability";
import { AbuseEventService } from "../../audit/abuse-event.service";
import { RATE_LIMIT_EXCEEDED } from "../filters/error-types.constants";

const DEFAULT_WINDOW_MS = 2000;
const DEFAULT_MAX_REQUESTS = 50;
const RETRY_AFTER_SECONDS = 2;

/**
 * Sliding-window rate limiter middleware using Redis sorted sets.
 * Applied to the seat map endpoint to detect and throttle abusive traffic.
 * When the limit is exceeded, persists an abuse_event and returns RFC 7807 429.
 */
@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimiterMiddleware.name);
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly abuseEventService: AbuseEventService,
    private readonly metricsService: MetricsService,
  ) {
    this.windowMs = Number(
      this.configService.get<string>(
        "RATE_LIMIT_WINDOW_MS",
        String(DEFAULT_WINDOW_MS),
      ),
    );
    this.maxRequests = Number(
      this.configService.get<string>(
        "RATE_LIMIT_MAX_REQUESTS",
        String(DEFAULT_MAX_REQUESTS),
      ),
    );
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const rateLimitKey = RedisKey.rateLimit(clientIp);
    const nowMs = Date.now();
    const count = await this.redisService.addRateLimitEntry(
      rateLimitKey,
      nowMs,
      this.windowMs,
    );
    if (count >= this.maxRequests) {
      this.logger.warn(
        `Rate limit exceeded for IP ${clientIp}: ${count} requests in ${this.windowMs}ms`,
      );
      const windowStart = new Date(nowMs - this.windowMs);
      const windowEnd = new Date(nowMs);
      this.metricsService.abuseEventsTotal
        .labels({ source_ip: clientIp })
        .inc();
      this.abuseEventService.record({
        sourceIp: clientIp,
        requestCount: count,
        windowStart,
        windowEnd,
        details: {
          endpoint: req.originalUrl,
          method: req.method,
        },
      });
      res
        .status(RATE_LIMIT_EXCEEDED.status)
        .header("Content-Type", "application/problem+json")
        .header("Retry-After", String(RETRY_AFTER_SECONDS))
        .json({
          type: RATE_LIMIT_EXCEEDED.type,
          title: RATE_LIMIT_EXCEEDED.title,
          status: RATE_LIMIT_EXCEEDED.status,
          detail: "Rate limit exceeded, please try again later",
          instance: req.originalUrl,
        });
      return;
    }
    next();
  }
}
