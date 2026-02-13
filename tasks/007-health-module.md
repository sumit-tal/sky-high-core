# 007 - Health Check Module

## Description

Implement the health check endpoint for liveness and readiness probes, verifying connectivity to PostgreSQL and Redis.

## Tasks

- [ ] Create `health/` module
- [ ] Implement `GET /health` endpoint (no auth required)
  - Check PostgreSQL connectivity
  - Check Redis connectivity
  - Return overall status with individual component statuses
- [ ] Use `@nestjs/terminus` for health check indicators

## Acceptance Criteria

- `GET /health` returns 200 when both DB and Redis are healthy
- `GET /health` returns 503 with details when any dependency is down
- Endpoint is excluded from JWT authentication
