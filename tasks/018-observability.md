# 018 - Observability: Logging, Metrics & Tracing

## Description

Set up structured logging (Pino), Prometheus metrics, and OpenTelemetry distributed tracing.

## Tasks

- [ ] **Structured Logging (Pino):**
  - Configure nestjs-pino for JSON-formatted logs
  - Include: timestamp, level, message, traceId, spanId, requestId
  - Add domain-specific fields: flightId, seatId, passengerId, action
  - Log all seat state transitions, check-in events, waitlist assignments, abuse events
  - Log external service calls with latency
- [ ] **Prometheus Metrics:**
  - Expose `GET /metrics` endpoint
  - Implement metrics from Technical PRD §10.2:
    - `skyhigh_seat_map_requests_total` (Counter)
    - `skyhigh_seat_hold_duration_seconds` (Histogram)
    - `skyhigh_seat_contention_total` (Counter)
    - `skyhigh_hold_expiry_total` (Counter)
    - `skyhigh_checkin_duration_seconds` (Histogram)
    - `skyhigh_waitlist_depth` (Gauge)
    - `skyhigh_waitlist_assignment_total` (Counter)
    - `skyhigh_abuse_events_total` (Counter)
    - `skyhigh_payment_request_duration_seconds` (Histogram)
    - `skyhigh_http_request_duration_seconds` (Histogram)
- [ ] **Distributed Tracing (OpenTelemetry):**
  - Auto-instrument: HTTP requests, TypeORM queries, Redis commands
  - Add manual spans for: seat hold acquisition, waitlist processing, payment calls
  - Propagate trace context to stub services via `traceparent` header
- [ ] Create logging interceptor in `common/interceptors/`

## Acceptance Criteria

- All logs are JSON-formatted with trace context
- `GET /metrics` returns Prometheus-compatible metrics
- Traces span across service boundaries
- Key business operations have custom metrics
