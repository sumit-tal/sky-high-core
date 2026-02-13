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

- Node.js >= 18
- npm >= 9
- Docker & Docker Compose (for local infrastructure)

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
docker-compose up -d
```

### 4. Run the Application

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### 5. Verify

- **Health check:** `GET http://localhost:3000/health`
- **Metrics:** `GET http://localhost:3000/metrics`
- **API base:** `http://localhost:3000/api/v1/`

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

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `npm run start:dev`  | Start in watch mode            |
| `npm run build`      | Build for production           |
| `npm run start:prod` | Start production build         |
| `npm run test`       | Run unit tests                 |
| `npm run test:e2e`   | Run end-to-end tests           |
| `npm run test:cov`   | Run tests with coverage        |
| `npm run lint`       | Lint and fix code              |
| `npm run format`     | Format code with Prettier      |

## Environment Variables

See [`.env.example`](.env.example) for the full list of configurable environment variables.
# sky-high-core
