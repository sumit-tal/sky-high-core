# Project Structure (SkyHigh Core)

This repository contains the **SkyHigh Core** backend service (NestJS + TypeORM + Postgres + Redis) that powers the digital check-in system.

## High-level layout

```
.
├── src/                     # Application source (NestJS modules)
├── migrations/              # TypeORM migrations (DB schema)
├── seeds/                   # Seed scripts for local/dev data
├── test/                    # E2E + integration test suites (Jest + Testcontainers)
├── k6/                      # Load tests (k6) + runner script
├── stubs/                   # HTTP stub services used locally (payment/weight/notification)
├── tasks/                   # Task-by-task implementation specs (project narrative)
├── dist/                    # Build output (generated)
├── coverage/                # Test coverage output (generated)
├── node_modules/            # Installed dependencies (generated)
├── API-SPECIFICATION.yml    # OpenAPI 3.0 specification for the REST API
├── docker-compose.yml       # Local infra: Postgres, Redis, pgAdmin, and stub services
├── Dockerfile               # Production container build for the NestJS app
├── package.json             # Node scripts + dependencies
├── tsconfig.json            # TypeScript configuration
├── tsconfig.build.json      # TypeScript build configuration
├── nest-cli.json            # Nest CLI configuration (sourceRoot, build behavior)
├── .env.example             # Example environment variables
└── README.md                # Setup, architecture overview, and developer guide
```

## Root-level folders

### `src/`
Primary application source code.

- **Entry points**
  - `src/main.ts`
    - Boots the Nest application.
    - Sets global prefix `api/v1` (excluding `GET /health` and `GET /metrics`).
    - Configures global validation pipe and global exception filter.
  - `src/app.module.ts`
    - Root Nest module wiring together infrastructure (config, TypeORM, logging, metrics, Redis, JWT guard) and all domain modules.
  - `src/instrumentation.ts`
    - Observability bootstrap (OpenTelemetry instrumentation).

### `migrations/`
TypeORM migration files (schema evolution). The app is configured to **not** use `synchronize` and instead relies on migrations.

- Example: `1771000615393-InitialSchema.ts`.

### `seeds/`
Database seeding scripts used for local development.

- `seeds/seed.ts` seeds aircraft types, flights, seats, and passengers.

### `test/`
Test suites and Jest configs.

- `test/app.e2e-spec.ts` basic e2e test.
- `test/integration/` integration tests (Jest + Testcontainers).
- `test/jest-e2e.json` e2e Jest configuration.

### `k6/`
Load/performance tests using k6.

- `run-load-tests.sh` orchestrates running suites.
- `seat-map-load-test.js`, `seat-hold-load-test.js`, `e2e-checkin-load-test.js`, `abuse-detection-load-test.js`.
- `helpers/` shared k6 helpers.

### `stubs/`
Stubbed external services used by `docker-compose.yml` for local runs.

- `stubs/payment/` payment service stub.
- `stubs/weight/` baggage weight service stub.
- `stubs/notification/` notification service stub.

### `tasks/`
Task specs used to drive implementation. Helpful to understand the “why” and the intended behavior.

- `001-project-setup.md` … `021-load-tests.md`.

### `dist/`, `coverage/`, `node_modules/`
Generated artifacts.

- `dist/` is created by `npm run build`.
- `coverage/` is created by `npm run test:cov`.
- `node_modules/` is created by `npm install`.

## `src/` module structure

`src/` follows a modular NestJS architecture: each domain area is typically a folder containing

- `*.module.ts` (Nest module)
- `*.controller.ts` (HTTP layer)
- `*.service.ts` (business logic)
- `*.entity.ts` (TypeORM entity)
- `dto/` (request/response DTOs)
- `*.spec.ts` (unit tests)

### `src/common/` (cross-cutting infrastructure)
Shared infrastructure and framework integration.

- `common/config/`
  - Environment configuration + validation (Joi).
- `common/database/`
  - TypeORM data source used by CLI commands and migrations.
- `common/redis/`
  - Redis client provider, Redis service wrapper, Redlock provider, and keyspace expiry subscriber.
- `common/observability/`
  - Metrics service and tracing utilities; module wrapper.
- `common/filters/`
  - Global exception filter and error formatting (Problem Details / RFC7807-style handling).
- `common/guards/`
  - JWT auth guard used as a global guard.
- `common/interceptors/`
  - Cross-cutting request logging/telemetry interceptors.
- `common/middleware/`
  - Middleware such as rate limiting.
- `common/decorators/`
  - Shared Nest decorators.
- `common/types/`
  - Shared types/enums.
- `common/utils/`
  - Small shared utilities.

### Domain modules

- `src/flight/`
  - Read-oriented flight access (list flights, fetch details).
- `src/aircraft-type/`
  - Read-oriented aircraft configuration (seat layout, etc.).
- `src/passenger/`
  - Read-oriented passenger access.
- `src/seat/`
  - Seat map retrieval and caching; seat entity and related endpoints.
- `src/check-in/`
  - Core check-in flow.
  - Manages seat holds and confirmation/cancellation.
  - Contains hold expiry handling (keyspace notifications + sweep fallback).
- `src/waitlist/`
  - Waitlist join/leave/status and seat auto-assignment when inventory becomes available.
- `src/baggage/`
  - Baggage validation and overweight fee computation; integrates with weight stub.
- `src/payment/`
  - Payment gating/integration logic; integrates with payment stub.
- `src/notification/`
  - Notification dispatch logic; integrates with notification stub.
- `src/audit/`
  - Audit logging and abuse event recording.
- `src/health/`
  - Health checks (e.g., for infra readiness) and liveness endpoints.

## Build & runtime wiring (where to look)

- **App bootstrap**: `src/main.ts`
- **Module graph**: `src/app.module.ts`
- **DB config**: `src/common/database/data-source.ts` and TypeORM config in `AppModule`
- **Redis + locks**: `src/common/redis/*`
- **Observability**: `src/instrumentation.ts`, `src/common/observability/*`
- **Docker local stack**: `docker-compose.yml` (app + postgres + redis + stubs)
