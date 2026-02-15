import { trace, Span, SpanStatusCode, Tracer, context } from "@opentelemetry/api";

const TRACER_NAME = "sky-high-core";

/**
 * Returns the application-level OpenTelemetry tracer.
 */
export const getTracer = (): Tracer => trace.getTracer(TRACER_NAME);

/**
 * Extracts traceId and spanId from the current active span.
 * Returns empty strings if no active span exists.
 */
export const getTraceContext = (): {
  readonly traceId: string;
  readonly spanId: string;
} => {
  const span = trace.getSpan(context.active());
  if (!span) {
    return { traceId: "", spanId: "" };
  }
  const spanContext = span.spanContext();
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
};

/**
 * Wraps an async function in a manual OpenTelemetry span.
 * Automatically records errors and sets span status.
 */
export const withSpan = async <T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, async (span: Span) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
};
