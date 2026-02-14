# SkyHigh Core — Progress Tracker

> Last updated: 2026-02-14

---

## Overview

| Status         | Count  |
| -------------- | ------ |
| ✅ Completed   | 13     |
| 🔧 In Progress | 0      |
| ⬜ Not Started | 8      |
| **Total**      | **21** |

---

## Task Status

| #   | Task                                                                              | Status         | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | [Project Setup & Configuration](tasks/001-project-setup.md)                       | ✅ Completed   | NestJS init, dependencies, config, validation pipe, API prefix                                                                                                                                                                                                                                                                                                                           |
| 002 | [Docker Compose & Infrastructure](tasks/002-docker-compose-infrastructure.md)     | ✅ Completed   | Dockerfile, docker-compose.yml, stub services, health checks, Redis keyspace notifications                                                                                                                                                                                                                                                                                               |
| 003 | [Database Setup, Entities & Migrations](tasks/003-database-setup-and-entities.md) | ✅ Completed   | TypeORM config, 8 entities, enums, indexes, migration, seed script (3 aircraft types, 3 flights, 878 seats, 10 passengers)                                                                                                                                                                                                                                                               |
| 004 | [Redis Client & Redlock Setup](tasks/004-redis-setup.md)                          | ✅ Completed   | Redis client/subscriber providers, Redlock, key constants, keyspace expiry subscriber, RedisService utility, unit tests                                                                                                                                                                                                                                                                  |
| 005 | [JWT Authentication Guard](tasks/005-auth-jwt-guard.md)                           | ✅ Completed   | JWT guard (global via APP_GUARD), @Public decorator, @CurrentUser decorator, test JWT utility, 9 unit tests                                                                                                                                                                                                                                                                              |
| 006 | [Global Exception Filter (RFC 7807)](tasks/006-global-error-handling.md)          | ✅ Completed   | Global exception filter (catches all), RFC 7807 ProblemDetails, 10 domain exceptions, error type constants, 25 unit tests                                                                                                                                                                                                                                                                |
| 007 | [Health Check Module](tasks/007-health-module.md)                                 | ✅ Completed   | @nestjs/terminus, TypeORM + Redis health indicators, @Public endpoint, 8 unit tests                                                                                                                                                                                                                                                                                                      |
| 008 | [Flight Module](tasks/008-flight-module.md)                                       | ✅ Completed   | FlightController, FlightService, response DTOs, pagination, RFC 7807 404, 10 unit tests                                                                                                                                                                                                                                                                                                  |
| 009 | [Seat Map Module](tasks/009-seat-map-module.md)                                   | ✅ Completed   | SeatModule, SeatController, SeatService, SeatMapResponseDto, SeatResponseDto, Redis caching (2s TTL), cache invalidation, 8 unit tests                                                                                                                                                                                                                                                   |
| 010 | [Check-In: Seat Hold](tasks/010-checkin-hold-seat.md)                             | ✅ Completed   | CheckInModule, CheckInController (POST /api/v1/check-ins), CheckInService, Redlock + CAS seat hold, Redis 120s TTL, audit log, 14 unit tests                                                                                                                                                                                                                                             |
| 011 | [Hold Expiry Mechanism](tasks/011-hold-expiry-mechanism.md)                       | ✅ Completed   | HoldExpiryService, Redis keyspace notification listener (primary), @Cron background sweep (fallback, 30s), CAS release logic, audit log, cache invalidation, 15 unit tests                                                                                                                                                                                                               |
| 012 | [Check-In: Confirm & Cancel](tasks/012-checkin-confirm-and-cancel.md)             | ✅ Completed   | CheckInController (GET/PATCH/DELETE /api/v1/check-ins/:id), confirm flow (baggage validation, payment gating), cancel flow (flight departure check, waitlist trigger), DTOs, HttpModule, 52 unit tests                                                                                                                                                                                   |
| 013 | [Baggage & Payment Modules](tasks/013-baggage-and-payment-modules.md)             | ✅ Completed   | BaggageModule (BaggageService, weight validation via stub, fee calculation), PaymentModule (PaymentService, exponential backoff retry, timeout, audit logging), CheckInService refactored to delegate to BaggageService/PaymentService, DTOs, env vars (PAYMENT_TIMEOUT_MS, PAYMENT_MAX_RETRIES, PAYMENT_INITIAL_BACKOFF_MS, WEIGHT_SERVICE_TIMEOUT_MS), API spec updated, 49 unit tests |
| 014 | [Waitlist Module](tasks/014-waitlist-module.md)                                   | ✅ Completed   | WaitlistModule, WaitlistController (POST/GET/DELETE), WaitlistService (FIFO join, leave, get, auto-assignment via Redlock), HoldExpiryService integration (waitlist hold expiry → EXPIRED + re-trigger), WaitlistNotFoundException, DTOs, audit logging (WAITLIST_JOINED, WAITLIST_ASSIGNED), notification event, 24 unit tests                                                          |
| 015 | [Notification Module](tasks/015-notification-module.md)                           | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 016 | [Audit Module](tasks/016-audit-module.md)                                         | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 017 | [Rate Limiter & Abuse Detection](tasks/017-rate-limiter-abuse-detection.md)       | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 018 | [Observability](tasks/018-observability.md)                                       | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 019 | [Unit Tests](tasks/019-unit-tests.md)                                             | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 020 | [Integration Tests](tasks/020-integration-tests.md)                               | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |
| 021 | [Load Tests](tasks/021-load-tests.md)                                             | ⬜ Not Started |                                                                                                                                                                                                                                                                                                                                                                                          |

---

## Phase Breakdown

### Phase 1 — Foundation (Tasks 001–007)

Infrastructure, database, Redis, auth, error handling, and health checks.

| Task                          | Status |
| ----------------------------- | ------ |
| 001 Project Setup             | ✅     |
| 002 Docker Compose            | ✅     |
| 003 Database & Entities       | ✅     |
| 004 Redis & Redlock           | ✅     |
| 005 JWT Auth Guard            | ✅     |
| 006 Error Handling (RFC 7807) | ✅     |
| 007 Health Module             | ✅     |

### Phase 2 — Core Domain (Tasks 008–016)

Flight, seat map, check-in, waitlist, baggage, payment, notifications, and audit.

| Task                           | Status |
| ------------------------------ | ------ |
| 008 Flight Module              | ✅     |
| 009 Seat Map Module            | ✅     |
| 010 Check-In: Seat Hold        | ✅     |
| 011 Hold Expiry                | ✅     |
| 012 Check-In: Confirm & Cancel | ✅     |
| 013 Baggage & Payment          | ⬜     |
| 014 Waitlist Module            | ✅     |
| 015 Notification Module        | ⬜     |
| 016 Audit Module               | ⬜     |

### Phase 3 — Security & Observability (Tasks 017–018)

Rate limiting, abuse detection, logging, metrics, and tracing.

| Task                               | Status |
| ---------------------------------- | ------ |
| 017 Rate Limiter & Abuse Detection | ⬜     |
| 018 Observability                  | ⬜     |

### Phase 4 — Testing (Tasks 019–021)

Unit tests, integration tests, and load tests.

| Task                  | Status |
| --------------------- | ------ |
| 019 Unit Tests        | ⬜     |
| 020 Integration Tests | ⬜     |
| 021 Load Tests        | ⬜     |

---

## Changelog

| Date       | Task | Change                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-02-13 | 001  | ✅ Completed — Project initialized with NestJS, all dependencies installed, config/validation/API prefix set up                                                                                                                                                                                                                                                                |
| 2026-02-13 | 002  | ✅ Completed — Dockerfile (multi-stage), docker-compose.yml with 7 services, stub services (payment/weight/notification), health checks, Redis keyspace notifications, .dockerignore                                                                                                                                                                                           |
| 2026-02-13 | 003  | ✅ Completed — TypeORM DataSource config, 8 entities (AircraftType, Flight, Passenger, Seat, CheckIn, Waitlist, AuditLog, AbuseEvent), all indexes per PRD §2.3, migration, seed script                                                                                                                                                                                        |
| 2026-02-13 | 004  | ✅ Completed — Redis client & subscriber providers (ioredis), Redlock distributed locking, typed key constants & builders, keyspace expiry subscriber (hold:\* → event), RedisService utility (CAS release, rate-limit pipeline, seat map cache), 36 unit tests                                                                                                                |
| 2026-02-14 | 005  | ✅ Completed — JwtAuthGuard (global via APP_GUARD), @Public decorator for public routes, @CurrentUser param decorator, Express type augmentation, JwtModule registration, generateTestJwt utility, 9 unit tests                                                                                                                                                                |
| 2026-02-14 | 006  | ✅ Completed — Global exception filter (@Catch() all), RFC 7807 ProblemDetails format, 10 domain exception classes, error type constants, TypeORM error handling, Content-Type application/problem+json, 25 unit tests                                                                                                                                                         |
| 2026-02-14 | 007  | ✅ Completed — @nestjs/terminus health checks, TypeOrmHealthIndicator (PostgreSQL), custom RedisHealthIndicator (PING), @Public decorator, GET /health returns 200/503, 8 unit tests                                                                                                                                                                                           |
| 2026-02-14 | 008  | ✅ Completed — FlightModule (read-only), FlightController, FlightService, PaginationQueryDto, FlightResponseDto, AircraftTypeResponseDto, PaginatedFlightsResponseDto, RFC 7807 flight-not-found 404, 10 unit tests                                                                                                                                                            |
| 2026-02-14 | 009  | ✅ Completed — SeatModule, SeatController (GET /api/v1/flights/:flightId/seats), SeatService with Redis caching (seatmap:{flightId}, 2s TTL), cache invalidation, SeatMapResponseDto, SeatResponseDto, RFC 7807 404 for invalid flights, 8 unit tests                                                                                                                          |
| 2026-02-14 | 010  | ✅ Completed — CheckInModule, CheckInController (POST /api/v1/check-ins), CheckInService with Redlock distributed lock + CAS seat hold, Redis hold key (hold:{seatId}, 120s TTL), audit log (SEAT_HELD), seat map cache invalidation, StartCheckInRequestDto, CheckInResponseDto, edge cases (flight/seat not found, already checked in, seat not available), 14 unit tests    |
| 2026-02-14 | 011  | ✅ Completed — HoldExpiryService (dual-mechanism): Redis keyspace notification listener (primary, @OnEvent), @Cron background sweep every 30s (fallback), shared CAS release logic (Redlock + DB transaction), check-in → CANCELLED, audit log (SEAT_RELEASED), seat map cache invalidation, @nestjs/schedule + ScheduleModule, 15 unit tests                                  |
| 2026-02-14 | 012  | ✅ Completed — CheckInController (GET/PATCH/DELETE), confirmCheckIn (hold validation, weight service call, excess baggage fee calc, payment service call with timeout+retry, AWAITING_PAYMENT flow), cancelCheckIn (flight departure check, seat release, waitlist event trigger), getCheckIn, UpdateCheckInRequestDto, CheckInCancelledResponseDto, HttpModule, 52 unit tests |
| 2026-02-14 | 014  | ✅ Completed — WaitlistModule, WaitlistController (POST join, GET status, DELETE leave), WaitlistService (FIFO queue, Redlock auto-assignment, CAS seat hold, audit logging), HoldExpiryService integration (waitlist hold expiry → EXPIRED + re-trigger FIFO), WaitlistNotFoundException, WaitlistResponseDto, notification event emission, API spec updated, 24 unit tests   |
