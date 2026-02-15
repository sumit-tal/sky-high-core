import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { Request, Response } from "express";
import { MetricsService } from "../observability/metrics.service";
import { getTraceContext } from "../observability/tracing.util";

/**
 * Global logging interceptor that:
 * 1. Logs every HTTP request with structured fields (traceId, spanId, requestId, method, path).
 * 2. Records `skyhigh_http_request_duration_seconds` histogram metric.
 * 3. Attaches domain-specific fields when available in the request body/params.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly metricsService: MetricsService) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const ctx = executionContext.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const startTime = Date.now();
    const { traceId, spanId } = getTraceContext();
    const method = request.method;
    const path = request.route?.path ?? request.url;
    const domainFields = this.extractDomainFields(request);
    this.logger.log({
      message: `Incoming ${method} ${request.url}`,
      traceId,
      spanId,
      method,
      path: request.url,
      ...domainFields,
    });
    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = String(response.statusCode);
          this.metricsService.httpRequestDurationSeconds
            .labels({
              method,
              path: this.normalizePath(path),
              status: statusCode,
            })
            .observe(durationMs / 1000);
          this.logger.log({
            message: `Completed ${method} ${request.url} ${statusCode} ${durationMs}ms`,
            traceId,
            spanId,
            method,
            path: request.url,
            statusCode: response.statusCode,
            durationMs,
            ...domainFields,
          });
        },
        error: (error: Error) => {
          const durationMs = Date.now() - startTime;
          const statusCode = String(
            response.statusCode >= 400 ? response.statusCode : 500,
          );
          this.metricsService.httpRequestDurationSeconds
            .labels({
              method,
              path: this.normalizePath(path),
              status: statusCode,
            })
            .observe(durationMs / 1000);
          this.logger.error({
            message: `Failed ${method} ${request.url} ${statusCode} ${durationMs}ms — ${error.message}`,
            traceId,
            spanId,
            method,
            path: request.url,
            statusCode: Number(statusCode),
            durationMs,
            error: error.message,
            ...domainFields,
          });
        },
      }),
    );
  }

  private extractDomainFields(
    request: Request,
  ): Record<string, string | undefined> {
    const fields: Record<string, string | undefined> = {};
    const params = request.params as Record<string, string>;
    if (params.flightId) {
      fields.flightId = params.flightId;
    }
    if (params.checkInId) {
      fields.checkInId = params.checkInId;
    }
    if (params.waitlistId) {
      fields.waitlistId = params.waitlistId;
    }
    const body = request.body as Record<string, unknown> | undefined;
    if (body?.flightId) {
      fields.flightId = String(body.flightId);
    }
    if (body?.seatId) {
      fields.seatId = String(body.seatId);
    }
    const user = (request as unknown as Record<string, unknown>).user as
      | { sub?: string }
      | undefined;
    if (user?.sub) {
      fields.passengerId = user.sub;
    }
    return fields;
  }

  /**
   * Normalize Express route path to avoid high-cardinality labels.
   * e.g. /api/v1/flights/abc-123/seats → /api/v1/flights/:flightId/seats
   */
  private normalizePath(path: string): string {
    return path.replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/:id",
    );
  }
}
