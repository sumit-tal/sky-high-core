# 002 - Docker Compose & Infrastructure

## Description

Set up Docker Compose for local development with all required services: PostgreSQL, Redis (with keyspace notifications), pgAdmin, and stub services.

## Tasks

- [ ] Create `Dockerfile` for the NestJS application (multi-stage build)
- [ ] Create `docker-compose.yml` with services:
  - `app` — NestJS application (port 3000)
  - `postgres` — PostgreSQL 16 Alpine (port 5432)
  - `redis` — Redis 7 Alpine (port 6379) with `--notify-keyspace-events Ex`
  - `pgadmin` — pgAdmin4 (port 5050)
  - `stub-payment` — Stub payment service (port 3001)
  - `stub-weight` — Stub weight service (port 3002)
  - `stub-notification` — Stub notification service (port 3003)
- [ ] Create stub services scaffolding under `stubs/` directory:
  - `stubs/payment/` — Simple Express app returning payment confirmation
  - `stubs/weight/` — Simple Express app returning baggage weight
  - `stubs/notification/` — Simple Express app accepting notification events
- [ ] Configure Docker networking between services
- [ ] Add health checks for postgres and redis in compose
- [ ] Create `.dockerignore`

## Acceptance Criteria

- `docker-compose up` starts all services successfully
- PostgreSQL is accessible on port 5432
- Redis is accessible on port 6379 with keyspace notifications enabled
- pgAdmin is accessible on port 5050
- All three stub services respond to HTTP requests
