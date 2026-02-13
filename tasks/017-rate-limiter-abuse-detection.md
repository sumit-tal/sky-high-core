# 017 - Rate Limiter & Abuse Detection

## Description

Implement the sliding-window rate limiter middleware using Redis sorted sets to detect and throttle abusive traffic on the seat map endpoint.

## Tasks

- [ ] Create rate limiter middleware in `common/middleware/`
- [ ] Apply middleware to `GET /api/v1/flights/:flightId/seats`
- [ ] Implement sliding-window algorithm (Technical PRD §9.1):
  1. Key: `ratelimit:{clientIp}`
  2. On each request:
     - `ZREMRANGEBYSCORE key 0 (now - RATE_LIMIT_WINDOW_MS)` — prune old entries
     - `ZADD key now requestId` — add current request
     - `ZCARD key` — count requests in window
     - If count >= `RATE_LIMIT_MAX_REQUESTS` (default 50):
       - Persist `abuse_event` to DB
       - Return 429 with `Retry-After: 2` header
     - `EXPIRE key 2` — auto-cleanup
- [ ] Format 429 response as RFC 7807 (`rate-limit-exceeded`)
- [ ] Configuration via environment variables:
  - `RATE_LIMIT_WINDOW_MS` (default: 2000)
  - `RATE_LIMIT_MAX_REQUESTS` (default: 50)

## Acceptance Criteria

- Requests from the same IP exceeding 50 in 2 seconds receive 429
- 429 response includes `Retry-After` header
- Abuse event is persisted to the database
- Normal traffic is not affected
- Rate limiter uses Redis sorted sets (not in-memory)
