# SkyHigh Core – Digital Check-In System

Backend service powering the digital self-service check-in system for SkyHigh Airlines. Handles seat selection, time-bound holds, baggage validation, payment gating, waitlist management, and abuse detection under high-concurrency conditions.

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** NestJS
- **Database:** PostgreSQL (TypeORM)
- **Cache / Locks:** Redis (ioredis, Redlock)
- **Auth:** JWT (validation only)
- **Logging:** Pino
- **Metrics:** Prometheus
- **Tracing:** OpenTelemetry

## Prerequisites

- Node.js >= 20 (required by Testcontainers; managed via `.nvmrc`)
- npm >= 9
- Docker & Docker Compose (for local infrastructure)
- [k6](https://k6.io/docs/get-started/installation/) (for load tests only)

## Getting Started

### 1. Clone & Install

```bash
git clone <repo-url>
cd sky-high-core
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your local configuration
```

### 3. Start Infrastructure (PostgreSQL, Redis, Stubs)

```bash
docker compose up -d
```

### 4. Run Migrations & Seed

```bash
npm run migration:run
npm run seed
```

### 5. Run the Application

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### 6. Verify

- **Health check:** `GET http://localhost:3000/health`
- **Metrics:** `GET http://localhost:3000/metrics`
- **API base:** `http://localhost:3000/api/v1/`

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Client    │────▶│  NestJS App  │────▶│  PostgreSQL   │
│  (Browser)  │◀────│  (REST API)  │     │  (TypeORM)    │
└─────────────┘     └──────┬───────┘     └───────────────┘
                           │
                    ┌──────┴───────┐
                    │    Redis     │
                    │ (Redlock,    │
                    │  Cache,      │
                    │  Rate Limit, │
                    │  Keyspace)   │
                    └──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ Payment  │ │ Weight   │ │ Notification │
        │  Stub    │ │  Stub    │ │    Stub      │
        └──────────┘ └──────────┘ └──────────────┘
```

### Concurrency Model

- **Seat holds** use Redis distributed locks (Redlock) + Compare-And-Swap (CAS) for at-most-once semantics
- **Hold expiry** is dual-mechanism: Redis keyspace notifications (primary) + background sweep (fallback)
- **Waitlist** auto-assigns seats in FIFO order when holds expire or check-ins are cancelled
- **Rate limiting** uses a sliding-window algorithm backed by Redis sorted sets

### Key API Endpoints

| Method   | Endpoint                       | Description                    |
| -------- | ------------------------------ | ------------------------------ |
| `GET`    | `/api/v1/flights`              | List flights (paginated)       |
| `GET`    | `/api/v1/flights/:id/seats`    | Seat map (Redis-cached)        |
| `POST`   | `/api/v1/check-ins`            | Start check-in (hold seat)     |
| `GET`    | `/api/v1/check-ins/:id`        | Get check-in status            |
| `PATCH`  | `/api/v1/check-ins/:id`        | Confirm check-in (baggage/pay) |
| `DELETE` | `/api/v1/check-ins/:id`        | Cancel check-in                |
| `POST`   | `/api/v1/flights/:id/waitlist` | Join waitlist                  |
| `GET`    | `/api/v1/flights/:id/waitlist` | Get waitlist status            |
| `DELETE` | `/api/v1/flights/:id/waitlist` | Leave waitlist                 |
| `GET`    | `/health`                      | Health check                   |
| `GET`    | `/metrics`                     | Prometheus metrics             |

Full API specification: [`API-SPECIFICATION.yml`](API-SPECIFICATION.yml) (OpenAPI 3.0)

## Project Structure

```
src/
├── main.ts                    # Bootstrap, global pipes, filters
├── app.module.ts              # Root module
├── common/                    # Shared utilities
│   ├── config/                # Environment configuration
│   ├── filters/               # Global exception filter (RFC 7807)
│   ├── guards/                # JWT auth guard
│   ├── interceptors/          # Logging, tracing interceptors
│   ├── middleware/             # Rate limiter middleware
│   ├── decorators/            # Custom decorators
│   ├── database/              # TypeORM config, migrations
│   ├── redis/                 # Redis client provider, Redlock
│   └── types/                 # Shared types, enums, interfaces
├── seat/                      # Seat module
├── check-in/                  # Check-in module
├── waitlist/                  # Waitlist module
├── baggage/                   # Baggage module
├── payment/                   # Payment integration
├── notification/              # Notification integration
├── audit/                     # Audit module
├── flight/                    # Flight module (read-only)
├── aircraft-type/             # Aircraft type module (read-only)
├── passenger/                 # Passenger module (read-only)
└── health/                    # Health check module
```

## API Versioning

All endpoints are prefixed with `/api/v1`. Exceptions:

- `GET /health` — Health check (no prefix)
- `GET /metrics` — Prometheus metrics (no prefix)

## Error Format

All error responses follow [RFC 7807 Problem Details](https://tools.ietf.org/html/rfc7807):

```json
{
  "type": "https://skyhigh.com/problems/seat-already-held",
  "title": "Seat Already Held",
  "status": 409,
  "detail": "Seat 12A on flight SH-1042 is currently held by another passenger.",
  "instance": "/api/v1/check-ins"
}
```

## Scripts

| Command                       | Description                            |
| ----------------------------- | -------------------------------------- |
| `npm run start:dev`           | Start in watch mode                    |
| `npm run build`               | Build for production                   |
| `npm run start:prod`          | Start production build                 |
| `npm run test`                | Run unit tests                         |
| `npm run test:e2e`            | Run end-to-end tests                   |
| `npm run test:integration`    | Run integration tests (Testcontainers) |
| `npm run test:cov`            | Run tests with coverage                |
| `npm run test:load`           | Run all k6 load tests                  |
| `npm run test:load:seat-map`  | Run seat map retrieval load test       |
| `npm run test:load:seat-hold` | Run seat hold acquisition load test    |
| `npm run test:load:e2e`       | Run end-to-end check-in load test      |
| `npm run test:load:abuse`     | Run abuse detection load test          |
| `npm run lint`                | Lint and fix code                      |
| `npm run format`              | Format code with Prettier              |
| `npm run seed`                | Seed the database with sample data     |
| `npm run migration:run`       | Run TypeORM migrations                 |
| `npm run migration:generate`  | Generate a new migration               |
| `npm run migration:revert`    | Revert the last migration              |

## Testing

### Unit Tests

Comprehensive unit tests covering all services, guards, middleware, and utility functions using **Jest** with mocked dependencies. Test naming follows the `When_<condition>_Then_<expected>` convention.

**23 suites, 255 tests:**

| Module                | Tests | Key Scenarios                                                                                                                                                |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SeatService           | 8     | Cache hit/miss, flight 404, cache invalidation                                                                                                               |
| CheckInService        | 26    | Seat hold, CAS, already held 409, already checked in 409, hold expired 410, baggage under/over limit, payment success/failure, cancel before/after departure |
| HoldExpiryService     | 17    | Keyspace expiry, CAS release, double-release no-op, waitlist trigger, waitlist entry EXPIRED marking                                                         |
| WaitlistService       | 14    | FIFO join, already on waitlist 409, auto-assignment, no waiting passengers, CAS failure, waitlist-assigned hold expiry re-trigger                            |
| BaggageService        | 10    | Under/over limit fee calc, weight service fallback                                                                                                           |
| PaymentService        | 10    | Success, timeout, retry with exponential backoff, non-confirmed status                                                                                       |
| RateLimiterMiddleware | 11    | Under/at threshold, 429 response, abuse event recording, window reset                                                                                        |
| JwtAuthGuard          | 9     | Valid/expired/missing token, public routes, wrong secret                                                                                                     |
| AuditService          | 8     | Fire-and-forget log, transactional log, error handling                                                                                                       |
| AbuseEventService     | 7     | Record event, daily cleanup, retention days                                                                                                                  |
| NotificationService   | 9     | Fire-and-forget HTTP, timeout handling, error logging                                                                                                        |
| Controllers & Others  | 126   | Controller delegation, exception filter, health checks, Redis, metrics, logging interceptor                                                                  |

```bash
npm run test
```

### Integration Tests

End-to-end integration tests using **Jest + Testcontainers** with real PostgreSQL and Redis instances. Each test suite gets fresh containers for full isolation. Requires **Node.js ≥ 20** and **Docker** running locally.

**9 suites, 14 tests:**

| Suite                    | Tests | Key Scenarios                                                                                       |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------- |
| Concurrent Seat Hold     | 2     | N parallel requests for same seat → exactly one 201, rest 409; different seats succeed concurrently |
| Hold Expiry              | 1     | Seat hold expires → seat released to AVAILABLE, check-in CANCELLED                                  |
| Full Check-In Flow       | 2     | Hold → baggage (under limit) → confirm → COMPLETED; zero baggage confirm                            |
| Check-In with Payment    | 2     | Overweight baggage → payment triggered → COMPLETED with paymentId; at-limit baggage → no payment    |
| Cancellation             | 2     | Cancel confirmed check-in → seat AVAILABLE; cancel triggers waitlist assignment                     |
| Waitlist Auto-Assignment | 1     | All seats held → join waitlist → seat expires → waitlisted passenger auto-assigned                  |
| Waitlist Hold Expiry     | 1     | Waitlist-assigned hold expires → entry EXPIRED → next FIFO passenger gets seat                      |
| Rate Limiter             | 2     | 55 requests in 2s → 429 response + abuse_event record; under-limit requests succeed                 |
| CAS Double-Release       | 1     | Both keyspace + sweep fire → only one SEAT_RELEASED audit entry (at-most-once)                      |

```bash
npm run test:integration
```

### Load Tests (k6)

Performance load tests using **k6** to validate P95 latency targets under simulated peak traffic. Tests run against the Docker Compose environment.

**Prerequisites:**

- [k6](https://k6.io/docs/get-started/installation/) installed
- Docker Compose services running (`docker compose up -d`)
- Database seeded (`npm run seed`)

**4 suites:**

| Suite                 | VUs                 | Duration | P95 Target | Description                                                         |
| --------------------- | ------------------- | -------- | ---------- | ------------------------------------------------------------------- |
| Seat Map Retrieval    | 500                 | 2 min    | < 1s       | High-concurrency reads against Redis-cached seat map endpoint       |
| Seat Hold Acquisition | 200                 | 2 min    | < 500ms    | Concurrent Redlock-based seat holds with contention (201/409 mix)   |
| End-to-End Check-In   | 100                 | 2 min    | < 5s       | Full flow: hold → baggage (under limit) → confirm → cleanup         |
| Abuse Detection       | 1 burst + 20 normal | 2 min    | N/A        | Bot-like burst (>50 req/2s) triggers 429; normal traffic unaffected |

```bash
# Run all load tests
npm run test:load

# Run individual tests
npm run test:load:seat-map
npm run test:load:seat-hold
npm run test:load:e2e
npm run test:load:abuse
```

## Docker Compose Services

| Service             | Port        | Description                              |
| ------------------- | ----------- | ---------------------------------------- |
| `app`               | 3010 → 3000 | NestJS application                       |
| `postgres`          | 5433 → 5432 | PostgreSQL 16                            |
| `redis`             | 6380 → 6379 | Redis 7 (keyspace notifications enabled) |
| `pgadmin`           | 5050 → 80   | pgAdmin web UI                           |
| `stub-payment`      | 3001        | Payment service stub                     |
| `stub-weight`       | 3002        | Weight service stub                      |
| `stub-notification` | 3003        | Notification service stub                |

```bash
docker compose up -d
```

## Seed Data

The seed script creates sample data for local development:

- **3 aircraft types:** A320 (30 rows × 6 cols), B737 (33 × 6), A380 (50 × 10)
- **3 flights:** SH-1042 (A320, +24h), SH-2085 (B737, +48h), SH-3001 (A380, +72h)
- **878 total seats** across all flights
- **10 passengers** with test data

```bash
npm run seed
```

## Environment Variables

See [`.env.example`](.env.example) for the full list of configurable environment variables.

| Variable                     | Default | Description                           |
| ---------------------------- | ------- | ------------------------------------- |
| `PORT`                       | `3000`  | Application port                      |
| `DATABASE_URL`               | —       | PostgreSQL connection string          |
| `REDIS_URL`                  | —       | Redis connection string               |
| `JWT_SECRET`                 | —       | Secret for JWT validation             |
| `SEAT_HOLD_TTL_SECONDS`      | `120`   | Seat hold duration in seconds         |
| `SEAT_MAP_CACHE_TTL_MS`      | `2000`  | Seat map Redis cache TTL              |
| `EXCESS_FEE_PER_KG`          | `10.00` | Excess baggage fee per kg             |
| `MAX_BAGGAGE_WEIGHT_KG`      | `25`    | Max baggage weight before excess fee  |
| `RATE_LIMIT_WINDOW_MS`       | `2000`  | Rate limiter sliding window           |
| `RATE_LIMIT_MAX_REQUESTS`    | `50`    | Max requests per window               |
| `PAYMENT_SERVICE_URL`        | —       | Payment stub service URL              |
| `WEIGHT_SERVICE_URL`         | —       | Weight stub service URL               |
| `NOTIFICATION_SERVICE_URL`   | —       | Notification stub service URL         |
| `PAYMENT_TIMEOUT_MS`         | `5000`  | Payment service call timeout          |
| `PAYMENT_MAX_RETRIES`        | `3`     | Payment retry attempts                |
| `PAYMENT_INITIAL_BACKOFF_MS` | `500`   | Payment retry initial backoff         |
| `WEIGHT_SERVICE_TIMEOUT_MS`  | `5000`  | Weight service call timeout           |
| `NOTIFICATION_TIMEOUT_MS`    | `5000`  | Notification service call timeout     |
| `SWEEP_INTERVAL_SECONDS`     | `30`    | Background hold expiry sweep interval |
| `ABUSE_RETENTION_DAYS`       | `90`    | Abuse event retention period          |

## Documentation

- **[API-SPECIFICATION.yml](API-SPECIFICATION.yml)** — OpenAPI 3.0 specification
- **[PRD.md](PRD.md)** — Product Requirements Document
- **[technical-prd.md](technical-prd.md)** — Technical PRD with implementation details
- **[Progress.md](Progress.md)** — Task progress tracker (21/21 completed)
- **[tasks/](tasks/)** — Individual task specifications

## License

Proprietary — SkyHigh Airlines. All rights reserved.
