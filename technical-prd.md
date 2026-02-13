# SkyHigh Core – Technical PRD

## Technical Product Requirements Document

---

## 1. System Overview

SkyHigh Core is a **single deployable backend service** that powers the digital self-service check-in system for SkyHigh Airlines. It handles seat selection, time-bound holds, baggage validation, payment gating, waitlist management, and abuse detection — all under high-concurrency conditions during peak check-in windows.

### 1.1 Tech Stack

| Layer              | Technology                          |
| ------------------ | ----------------------------------- |
| Runtime            | Node.js (TypeScript)                |
| Framework          | NestJS                              |
| API Style          | REST (versioned: `/api/v1/...`)     |
| Primary Database   | PostgreSQL                          |
| ORM                | TypeORM (with built-in migrations)  |
| Cache / Locks      | Redis                               |
| Auth               | JWT (validation only, external IdP) |
| Logging            | Pino                                |
| Metrics            | Prometheus                          |
| Tracing            | OpenTelemetry                       |
| Containerization   | Docker Compose (local dev)          |
| Unit / Integration | Jest + Testcontainers               |
| Load Testing       | k6                                  |

### 1.2 Service Boundaries

SkyHigh Core is a **single NestJS application**. External dependencies are stubbed as separate Docker Compose services:

- **Stub Payment Service** — Simulates excess-baggage fee payment (sync HTTP).
- **Stub Weight Service** — Simulates baggage weight lookup (sync HTTP).
- **Stub Notification Service** — Simulates passenger notifications (event emitter / stub HTTP).

---

## 2. Data Model

### 2.1 Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  aircraft_type    │       │     flight        │       │    passenger     │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK, UUID)    │──┐    │ id (PK, UUID)    │       │ id (PK, UUID)    │
│ name (varchar)   │  │    │ flight_number    │       │ first_name       │
│ rows (int)       │  └───>│ aircraft_type_id  │       │ last_name        │
│ columns (varchar)│       │ departure_time   │       │ email            │
│ created_at       │       │ status (enum)    │       │ created_at       │
│ updated_at       │       │ created_at       │       │ updated_at       │
└──────────────────┘       │ updated_at       │       └────────┬─────────┘
                           └────────┬─────────┘                │
                                    │                          │
                           ┌────────▼─────────┐                │
                           │      seat         │                │
                           ├──────────────────┤                │
                           │ id (PK, UUID)    │                │
                           │ flight_id (FK)   │                │
                           │ row (int)        │                │
                           │ column (varchar) │                │
                           │ status (enum)    │◄───────────────┘
                           │ held_by (FK)     │     (via check_in)
                           │ held_at (timestamp)│
                           │ created_at       │
                           │ updated_at       │
                           └────────┬─────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼─────────┐ ┌────────▼─────────┐ ┌────────▼─────────┐
     │    check_in       │ │    waitlist       │ │  audit_log       │
     ├──────────────────┤ ├──────────────────┤ ├──────────────────┤
     │ id (PK, UUID)    │ │ id (PK, UUID)    │ │ id (PK, UUID)    │
     │ passenger_id (FK)│ │ flight_id (FK)   │ │ entity_type      │
     │ flight_id (FK)   │ │ passenger_id (FK)│ │ entity_id        │
     │ seat_id (FK)     │ │ position (int)   │ │ action (enum)    │
     │ status (enum)    │ │ status (enum)    │ │ from_state       │
     │ baggage_weight   │ │ created_at       │ │ to_state         │
     │ excess_fee       │ │ updated_at       │ │ actor_id         │
     │ payment_id       │ └──────────────────┘ │ metadata (jsonb) │
     │ created_at       │                      │ created_at       │
     │ updated_at       │                      └──────────────────┘
     └──────────────────┘
                           ┌──────────────────┐
                           │  abuse_event      │
                           ├──────────────────┤
                           │ id (PK, UUID)    │
                           │ source_ip        │
                           │ request_count    │
                           │ window_start     │
                           │ window_end       │
                           │ details (jsonb)  │
                           │ created_at       │
                           └──────────────────┘
```

### 2.2 Enums

```typescript
enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  HELD = 'HELD',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

enum CheckInStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

enum WaitlistStatus {
  WAITING = 'WAITING',
  ASSIGNED = 'ASSIGNED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

enum FlightStatus {
  SCHEDULED = 'SCHEDULED',
  BOARDING = 'BOARDING',
  DEPARTED = 'DEPARTED',
  CANCELLED = 'CANCELLED',
}

enum AuditAction {
  SEAT_HELD = 'SEAT_HELD',
  SEAT_CONFIRMED = 'SEAT_CONFIRMED',
  SEAT_RELEASED = 'SEAT_RELEASED',
  SEAT_CANCELLED = 'SEAT_CANCELLED',
  WAITLIST_JOINED = 'WAITLIST_JOINED',
  WAITLIST_ASSIGNED = 'WAITLIST_ASSIGNED',
  CHECKIN_STARTED = 'CHECKIN_STARTED',
  CHECKIN_COMPLETED = 'CHECKIN_COMPLETED',
  CHECKIN_CANCELLED = 'CHECKIN_CANCELLED',
  PAYMENT_REQUESTED = 'PAYMENT_REQUESTED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  ABUSE_DETECTED = 'ABUSE_DETECTED',
}
```

### 2.3 Entity Details

#### `aircraft_type`

Pre-seeded reference data. Defines the seat layout template.

| Column    | Type         | Notes                                      |
| --------- | ------------ | ------------------------------------------ |
| id        | UUID (PK)    | Auto-generated                             |
| name      | VARCHAR(50)  | e.g., "A320", "B737"                       |
| rows      | INT          | Number of seat rows (e.g., 30)             |
| columns   | VARCHAR(20)  | Column identifiers as CSV (e.g., "A,B,C,D,E,F") |
| created_at| TIMESTAMPTZ  | Auto-set                                   |
| updated_at| TIMESTAMPTZ  | Auto-set                                   |

#### `flight`

Pre-seeded. Each flight references an aircraft type. Seats are generated from the aircraft type template when a flight is seeded.

| Column           | Type         | Notes                          |
| ---------------- | ------------ | ------------------------------ |
| id               | UUID (PK)    | Auto-generated                 |
| flight_number    | VARCHAR(10)  | e.g., "SH-1042"               |
| aircraft_type_id | UUID (FK)    | References `aircraft_type.id`  |
| departure_time   | TIMESTAMPTZ  | Scheduled departure            |
| status           | FlightStatus | Default: SCHEDULED             |
| created_at       | TIMESTAMPTZ  | Auto-set                       |
| updated_at       | TIMESTAMPTZ  | Auto-set                       |

#### `passenger`

Pre-seeded. Represents a registered traveller.

| Column     | Type         | Notes          |
| ---------- | ------------ | -------------- |
| id         | UUID (PK)    | Auto-generated |
| first_name | VARCHAR(100) |                |
| last_name  | VARCHAR(100) |                |
| email      | VARCHAR(255) | Unique         |
| created_at | TIMESTAMPTZ  | Auto-set       |
| updated_at | TIMESTAMPTZ  | Auto-set       |

#### `seat`

Generated from `aircraft_type` template when a flight is seeded. One row per physical seat per flight.

| Column     | Type         | Notes                                    |
| ---------- | ------------ | ---------------------------------------- |
| id         | UUID (PK)    | Auto-generated                           |
| flight_id  | UUID (FK)    | References `flight.id`                   |
| row        | INT          | Seat row number (1-based)                |
| column     | VARCHAR(1)   | Seat column letter (A, B, C, ...)        |
| status     | SeatStatus   | Default: AVAILABLE                       |
| held_by    | UUID (FK)    | References `passenger.id`, nullable      |
| held_at    | TIMESTAMPTZ  | Timestamp when hold was acquired, nullable |
| created_at | TIMESTAMPTZ  | Auto-set                                 |
| updated_at | TIMESTAMPTZ  | Auto-set                                 |

**Indexes:**
- `UNIQUE (flight_id, row, column)` — No duplicate seats per flight.
- `INDEX (flight_id, status)` — Fast seat map queries.
- `INDEX (held_by)` — Lookup seats held by a passenger.

#### `check_in`

Tracks the end-to-end check-in process for a passenger on a flight.

| Column         | Type          | Notes                                   |
| -------------- | ------------- | --------------------------------------- |
| id             | UUID (PK)     | Auto-generated                          |
| passenger_id   | UUID (FK)     | References `passenger.id`               |
| flight_id      | UUID (FK)     | References `flight.id`                  |
| seat_id        | UUID (FK)     | References `seat.id`, nullable          |
| status         | CheckInStatus | Default: IN_PROGRESS                    |
| baggage_weight | DECIMAL(5,2)  | In kg, nullable                         |
| excess_fee     | DECIMAL(10,2) | Calculated fee in currency, nullable    |
| payment_id     | VARCHAR(100)  | External payment reference, nullable    |
| created_at     | TIMESTAMPTZ   | Auto-set                                |
| updated_at     | TIMESTAMPTZ   | Auto-set                                |

**Indexes:**
- `UNIQUE (passenger_id, flight_id)` — One check-in per passenger per flight.

#### `waitlist`

FIFO queue per flight. Passengers waiting for any available seat.

| Column       | Type           | Notes                          |
| ------------ | -------------- | ------------------------------ |
| id           | UUID (PK)      | Auto-generated                 |
| flight_id    | UUID (FK)      | References `flight.id`         |
| passenger_id | UUID (FK)      | References `passenger.id`      |
| position     | INT            | FIFO order (auto-incremented per flight) |
| status       | WaitlistStatus | Default: WAITING               |
| created_at   | TIMESTAMPTZ    | Auto-set                       |
| updated_at   | TIMESTAMPTZ    | Auto-set                       |

**Indexes:**
- `UNIQUE (flight_id, passenger_id)` — One waitlist entry per passenger per flight.
- `INDEX (flight_id, status, position)` — Fast FIFO lookup.

#### `audit_log`

Append-only log of all state transitions. Retained for minimum 90 days.

| Column      | Type         | Notes                                      |
| ----------- | ------------ | ------------------------------------------ |
| id          | UUID (PK)    | Auto-generated                             |
| entity_type | VARCHAR(50)  | e.g., "seat", "check_in", "waitlist"       |
| entity_id   | UUID         | ID of the affected entity                  |
| action      | AuditAction  | What happened                              |
| from_state  | VARCHAR(50)  | Previous state, nullable (for creates)     |
| to_state    | VARCHAR(50)  | New state                                  |
| actor_id    | UUID         | Passenger or system ID that triggered it   |
| metadata    | JSONB        | Additional context (IP, request details)   |
| created_at  | TIMESTAMPTZ  | Auto-set, immutable                        |

**Indexes:**
- `INDEX (entity_type, entity_id)` — Lookup audit trail for a specific entity.
- `INDEX (created_at)` — Time-range queries and retention cleanup.

#### `abuse_event`

Immutable log of detected abuse. Retained for minimum 90 days.

| Column        | Type         | Notes                                |
| ------------- | ------------ | ------------------------------------ |
| id            | UUID (PK)    | Auto-generated                       |
| source_ip     | VARCHAR(45)  | IPv4 or IPv6                         |
| request_count | INT          | Number of requests in the window     |
| window_start  | TIMESTAMPTZ  | Start of the sliding window          |
| window_end    | TIMESTAMPTZ  | End of the sliding window            |
| details       | JSONB        | Request paths, user agents, etc.     |
| created_at    | TIMESTAMPTZ  | Auto-set, immutable                  |

**Indexes:**
- `INDEX (source_ip, created_at)` — Lookup abuse history by source.

---

## 3. Redis Data Structures

### 3.1 Distributed Locks (Redlock)

| Key Pattern                          | Type   | TTL    | Purpose                                    |
| ------------------------------------ | ------ | ------ | ------------------------------------------ |
| `lock:seat:{seatId}`                 | String | 5s     | Mutual exclusion for seat state transitions |
| `lock:waitlist:{flightId}`           | String | 5s     | Mutual exclusion for waitlist processing    |

### 3.2 Seat Hold TTL

| Key Pattern                          | Type   | TTL    | Purpose                                    |
| ------------------------------------ | ------ | ------ | ------------------------------------------ |
| `hold:{seatId}`                      | String | 120s   | Tracks active hold; value = `passengerId`  |

- On key expiry (via keyspace notification), the system triggers hold release logic.
- Background sweep job runs every **30 seconds** as fallback to catch missed expirations.

### 3.3 Seat Map Cache

| Key Pattern                          | Type   | TTL    | Purpose                                    |
| ------------------------------------ | ------ | ------ | ------------------------------------------ |
| `seatmap:{flightId}`                 | String | 2s     | Cached JSON of seat availability           |

- Cache is invalidated on any seat state change for the flight.
- On cache miss, the seat map is fetched from PostgreSQL and cached.

### 3.4 Sliding-Window Rate Limiter

| Key Pattern                          | Type       | TTL    | Purpose                                |
| ------------------------------------ | ---------- | ------ | -------------------------------------- |
| `ratelimit:{ip}`                     | Sorted Set | 2s     | Timestamps of seat-map requests per IP |

- Members: request timestamps (score = timestamp).
- On each request: remove entries older than 2s, add current timestamp, check cardinality.
- If count ≥ 50 → return `429 Too Many Requests` with `Retry-After` header.

---

## 4. Module Architecture

```
src/
├── main.ts                          # Bootstrap, global pipes, filters
├── app.module.ts                    # Root module
│
├── common/                          # Shared utilities
│   ├── config/                      # Environment configuration (ConfigModule)
│   ├── database/                    # TypeORM config, migrations
│   ├── redis/                       # Redis client provider, Redlock setup
│   ├── filters/                     # Global exception filter (RFC 7807)
│   ├── guards/                      # JWT auth guard
│   ├── interceptors/                # Logging, tracing interceptors
│   ├── middleware/                   # Rate limiter middleware
│   ├── decorators/                  # Custom decorators (e.g., @CurrentUser)
│   └── types/                       # Shared types, enums, interfaces
│
├── seat/                            # Seat module
│   ├── seat.module.ts
│   ├── seat.controller.ts           # GET /flights/:flightId/seats
│   ├── seat.service.ts              # Seat map retrieval, caching
│   ├── seat.entity.ts               # TypeORM entity
│   └── dto/                         # Response DTOs
│
├── check-in/                        # Check-in module
│   ├── check-in.module.ts
│   ├── check-in.controller.ts       # POST /check-ins, PATCH /check-ins/:id, DELETE /check-ins/:id
│   ├── check-in.service.ts          # Hold, confirm, cancel orchestration
│   ├── check-in.entity.ts           # TypeORM entity
│   ├── hold-expiry.service.ts       # Redis keyspace listener + background sweep
│   └── dto/                         # Request/Response DTOs
│
├── waitlist/                        # Waitlist module
│   ├── waitlist.module.ts
│   ├── waitlist.controller.ts       # POST /flights/:flightId/waitlist, DELETE /waitlist/:id
│   ├── waitlist.service.ts          # FIFO queue management, auto-assignment
│   ├── waitlist.entity.ts           # TypeORM entity
│   └── dto/                         # Request/Response DTOs
│
├── baggage/                         # Baggage module
│   ├── baggage.module.ts
│   ├── baggage.service.ts           # Weight validation, fee calculation
│   └── dto/                         # DTOs
│
├── payment/                         # Payment integration module
│   ├── payment.module.ts
│   └── payment.service.ts           # Sync HTTP client to stub Payment Service
│
├── notification/                    # Notification integration module
│   ├── notification.module.ts
│   └── notification.service.ts      # Event emitter / stub HTTP client
│
├── audit/                           # Audit module
│   ├── audit.module.ts
│   ├── audit.service.ts             # Append-only audit logging
│   ├── audit-log.entity.ts          # TypeORM entity
│   └── abuse-event.entity.ts        # TypeORM entity
│
├── flight/                          # Flight module (read-only)
│   ├── flight.module.ts
│   ├── flight.controller.ts         # GET /flights, GET /flights/:id
│   ├── flight.service.ts
│   ├── flight.entity.ts             # TypeORM entity
│   └── dto/                         # Response DTOs
│
├── aircraft-type/                   # Aircraft type module (read-only)
│   ├── aircraft-type.module.ts
│   ├── aircraft-type.entity.ts      # TypeORM entity
│   └── dto/
│
├── passenger/                       # Passenger module (read-only)
│   ├── passenger.module.ts
│   ├── passenger.entity.ts          # TypeORM entity
│   └── dto/
│
└── health/                          # Health check module
    ├── health.module.ts
    └── health.controller.ts         # GET /health
```

---

## 5. API Contract

All endpoints are prefixed with `/api/v1`. All responses follow **RFC 7807 Problem Details** for errors.

### 5.1 Authentication

All endpoints (except `/health`) require a valid JWT in the `Authorization: Bearer <token>` header.

**JWT Claims (validated, not issued):**

| Claim | Type   | Description        |
| ----- | ------ | ------------------ |
| sub   | string | Passenger UUID     |
| iat   | number | Issued-at (epoch)  |
| exp   | number | Expiration (epoch) |

### 5.2 Endpoints

#### Flights

| Method | Path                        | Description                    |
| ------ | --------------------------- | ------------------------------ |
| GET    | `/api/v1/flights`           | List flights (with pagination) |
| GET    | `/api/v1/flights/:flightId` | Get flight details             |

#### Seat Map

| Method | Path                               | Description                          |
| ------ | ---------------------------------- | ------------------------------------ |
| GET    | `/api/v1/flights/:flightId/seats`  | Get seat map with availability       |

**Response (200):**

```json
{
  "flightId": "uuid",
  "aircraft": "A320",
  "seats": [
    {
      "id": "uuid",
      "row": 1,
      "column": "A",
      "status": "AVAILABLE"
    },
    {
      "id": "uuid",
      "row": 1,
      "column": "B",
      "status": "HELD"
    }
  ]
}
```

#### Check-In

| Method | Path                        | Description                                    |
| ------ | --------------------------- | ---------------------------------------------- |
| POST   | `/api/v1/check-ins`         | Start check-in (select seat → hold)            |
| PATCH  | `/api/v1/check-ins/:id`     | Update check-in (add baggage, confirm)         |
| DELETE | `/api/v1/check-ins/:id`     | Cancel check-in                                |
| GET    | `/api/v1/check-ins/:id`     | Get check-in status                            |

**POST `/api/v1/check-ins` — Request:**

```json
{
  "flightId": "uuid",
  "seatId": "uuid"
}
```

**POST — Response (201):**

```json
{
  "id": "uuid",
  "passengerId": "uuid",
  "flightId": "uuid",
  "seatId": "uuid",
  "status": "IN_PROGRESS",
  "holdExpiresAt": "2026-02-13T15:20:00Z",
  "createdAt": "2026-02-13T15:18:00Z"
}
```

**PATCH `/api/v1/check-ins/:id` — Add Baggage & Confirm:**

```json
{
  "baggageWeight": 28.5,
  "action": "CONFIRM"
}
```

**PATCH — Response (200) when payment required:**

```json
{
  "id": "uuid",
  "status": "AWAITING_PAYMENT",
  "baggageWeight": 28.5,
  "excessFee": 35.00,
  "message": "Excess baggage fee of 35.00 must be paid to complete check-in."
}
```

**PATCH — Response (200) when confirmed:**

```json
{
  "id": "uuid",
  "status": "COMPLETED",
  "seatId": "uuid",
  "baggageWeight": 20.0,
  "excessFee": null,
  "confirmedAt": "2026-02-13T15:19:30Z"
}
```

**DELETE — Response (200):**

```json
{
  "id": "uuid",
  "status": "CANCELLED",
  "cancelledAt": "2026-02-13T16:00:00Z"
}
```

#### Waitlist

| Method | Path                                    | Description                    |
| ------ | --------------------------------------- | ------------------------------ |
| POST   | `/api/v1/flights/:flightId/waitlist`    | Join waitlist for a flight     |
| DELETE | `/api/v1/waitlist/:id`                  | Leave waitlist                 |
| GET    | `/api/v1/flights/:flightId/waitlist`    | Get waitlist status for flight |

**POST — Response (201):**

```json
{
  "id": "uuid",
  "flightId": "uuid",
  "passengerId": "uuid",
  "position": 3,
  "status": "WAITING",
  "createdAt": "2026-02-13T15:25:00Z"
}
```

#### Health

| Method | Path      | Description                          |
| ------ | --------- | ------------------------------------ |
| GET    | `/health` | Liveness + readiness (DB + Redis)    |

### 5.3 Error Response Format (RFC 7807)

```json
{
  "type": "https://skyhigh.com/problems/seat-already-held",
  "title": "Seat Already Held",
  "status": 409,
  "detail": "Seat 12A on flight SH-1042 is currently held by another passenger.",
  "instance": "/api/v1/check-ins"
}
```

**Standard Error Types:**

| Type Suffix              | HTTP Status | When                                        |
| ------------------------ | ----------- | ------------------------------------------- |
| `seat-already-held`      | 409         | Seat is HELD or CONFIRMED by another        |
| `hold-expired`           | 410         | Hold window elapsed before confirm          |
| `payment-required`       | 402         | Excess baggage fee not yet paid             |
| `flight-not-found`       | 404         | Invalid flight ID                           |
| `seat-not-found`         | 404         | Invalid seat ID                             |
| `checkin-not-found`      | 404         | Invalid check-in ID                         |
| `already-checked-in`     | 409         | Passenger already has active check-in       |
| `already-on-waitlist`    | 409         | Passenger already on waitlist for flight    |
| `cancellation-not-allowed` | 403       | Flight already departed                     |
| `rate-limit-exceeded`    | 429         | Abuse threshold breached                    |
| `unauthorized`           | 401         | Missing or invalid JWT                      |

---

## 6. Concurrency & Seat Hold Design

### 6.1 Seat Hold Flow

```
Passenger selects seat
        │
        ▼
┌─────────────────────────┐
│ Acquire Redlock on       │
│ lock:seat:{seatId}       │
│ (TTL: 5s)                │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐     ┌──────────────────┐
│ Read seat.status from DB │────>│ Status != AVAILABLE│──> Release lock, return 409
└───────────┬─────────────┘     └──────────────────┘
            │ Status == AVAILABLE
            ▼
┌─────────────────────────┐
│ BEGIN TRANSACTION         │
│  UPDATE seat SET          │
│    status = HELD,         │
│    held_by = passengerId, │
│    held_at = NOW()        │
│  WHERE id = seatId        │
│    AND status = AVAILABLE  │  ◄── CAS: compare-and-swap guard
│  INSERT check_in record   │
│  INSERT audit_log record  │
│ COMMIT                    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ SET hold:{seatId}         │
│   = passengerId           │
│   EX 120                  │  ◄── Redis TTL for expiry
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Release Redlock           │
│ Return 201 with hold info │
└─────────────────────────┘
```

### 6.2 Hold Expiry (Dual Mechanism)

**Primary — Redis Keyspace Notification:**

1. Redis is configured with `notify-keyspace-events Ex`.
2. The application subscribes to `__keyevent@0__:expired` channel.
3. When `hold:{seatId}` expires, the listener:
   - Acquires Redlock on `lock:seat:{seatId}`.
   - Reads seat from DB; verifies `status == HELD` and `held_at + 120s <= NOW()` (CAS).
   - Updates seat to `AVAILABLE` within a transaction.
   - Logs to `audit_log`.
   - Triggers waitlist processing for the flight.
   - Releases lock.

**Fallback — Background Sweep:**

1. A `@Cron('*/30 * * * * *')` job (every 30 seconds) queries:
   ```sql
   SELECT * FROM seat
   WHERE status = 'HELD'
     AND held_at + INTERVAL '120 seconds' < NOW();
   ```
2. For each stale hold, executes the same release logic as the keyspace listener.
3. CAS guard prevents double-release (at-most-once semantics).

### 6.3 At-Most-Once Guarantee

The CAS pattern ensures idempotent release:

```sql
UPDATE seat
SET status = 'AVAILABLE', held_by = NULL, held_at = NULL
WHERE id = :seatId
  AND status = 'HELD'
  AND held_by = :passengerId;
-- rows_affected == 0 means already released → no-op
```

Both the keyspace listener and the sweep job use this same CAS update. Even if both fire for the same seat, only one will succeed.

---

## 7. Waitlist Processing

### 7.1 Auto-Assignment Flow

Triggered when a seat transitions to `AVAILABLE` (hold expiry or cancellation):

```
Seat becomes AVAILABLE
        │
        ▼
┌─────────────────────────┐
│ Acquire Redlock on        │
│ lock:waitlist:{flightId}  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ SELECT * FROM waitlist    │
│ WHERE flight_id = :fid    │
│   AND status = 'WAITING'  │
│ ORDER BY position ASC     │
│ LIMIT 1                   │
└───────────┬─────────────┘
            │
            ├── No waiting passenger → Release lock, seat stays AVAILABLE
            │
            ▼ Found passenger
┌─────────────────────────┐
│ Assign seat to passenger  │
│ (same hold flow as 6.1)  │
│ - seat → HELD (120s)     │
│ - waitlist → ASSIGNED     │
│ - Create check_in record  │
│ - Audit log               │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Emit notification event   │
│ (stub notification svc)   │
│ Release lock              │
└─────────────────────────┘
```

### 7.2 Waitlist Hold Expiry

If a waitlist-assigned passenger's hold expires:
- Seat transitions to `AVAILABLE`.
- Waitlist processing is triggered again → next FIFO passenger gets the seat.
- The expired passenger's waitlist status → `EXPIRED`.

---

## 8. Baggage & Payment Flow

### 8.1 Check-In Confirmation with Baggage

```
PATCH /api/v1/check-ins/:id  { baggageWeight: 28.5, action: "CONFIRM" }
        │
        ▼
┌─────────────────────────┐
│ Validate hold not expired │──> 410 Gone if expired
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Call Weight Service (stub) │
│ Validate baggage weight   │
└───────────┬─────────────┘
            │
            ├── weight <= 25 kg → Skip to CONFIRM
            │
            ▼ weight > 25 kg
┌─────────────────────────┐
│ Calculate excess fee:     │
│ fee = (weight - 25) *     │
│       EXCESS_FEE_PER_KG   │  ◄── Environment variable
│ Set check_in.status =     │
│   AWAITING_PAYMENT        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Call Payment Service (stub)│
│ Sync HTTP with timeout +  │
│ exponential backoff retry  │
└───────────┬─────────────┘
            │
            ├── Payment fails / timeout → Return 200 with AWAITING_PAYMENT status
            │                              (hold timer continues; passenger can retry)
            │
            ▼ Payment confirmed
┌─────────────────────────┐
│ BEGIN TRANSACTION         │
│  UPDATE seat              │
│    SET status = CONFIRMED │
│  UPDATE check_in          │
│    SET status = COMPLETED,│
│        payment_id = :ref  │
│  INSERT audit_log         │
│ COMMIT                    │
│ Invalidate seat map cache │
└─────────────────────────┘
```

### 8.2 Configuration

| Environment Variable   | Default | Description                        |
| ---------------------- | ------- | ---------------------------------- |
| `EXCESS_FEE_PER_KG`   | `10.00` | Fee per kg over the 25 kg limit    |
| `MAX_BAGGAGE_WEIGHT_KG`| `25`   | Maximum allowed baggage weight     |

---

## 9. Abuse Detection

### 9.1 Sliding-Window Rate Limiter (Middleware)

Applied to: `GET /api/v1/flights/:flightId/seats`

**Algorithm (Redis Sorted Set):**

```
Key: ratelimit:{clientIp}
On each request:
  1. ZREMRANGEBYSCORE key  0  (now - 2000ms)     // prune old entries
  2. ZADD key  now  requestId                     // add current request
  3. count = ZCARD key                            // count in window
  4. If count >= 50:
       - PERSIST abuse_event to DB
       - Return 429 with Retry-After: 2
  5. EXPIRE key 2                                 // auto-cleanup
```

### 9.2 Audit

Every `429` response triggers an `abuse_event` insert with:
- Source IP
- Request count in the window
- Window timestamps
- Request details (path, user-agent) in JSONB

Abuse events are **immutable** and retained for **90 days** minimum (enforced by a scheduled cleanup job that only deletes records older than 90 days).

---

## 10. Observability

### 10.1 Structured Logging (Pino)

All logs are JSON-formatted with:
- `timestamp`, `level`, `message`
- `traceId`, `spanId` (from OpenTelemetry context)
- `requestId` (correlation ID)
- Domain-specific fields: `flightId`, `seatId`, `passengerId`, `action`

**Logged Events:**
- Every seat state transition
- Every check-in lifecycle event
- Every waitlist assignment
- Every abuse detection event
- External service calls (payment, weight, notification) with latency

### 10.2 Prometheus Metrics

| Metric Name                           | Type      | Labels                     |
| ------------------------------------- | --------- | -------------------------- |
| `skyhigh_seat_map_requests_total`     | Counter   | `flight_id`, `status`      |
| `skyhigh_seat_hold_duration_seconds`  | Histogram | `flight_id`                |
| `skyhigh_seat_contention_total`       | Counter   | `flight_id`                |
| `skyhigh_hold_expiry_total`           | Counter   | `flight_id`, `mechanism`   |
| `skyhigh_checkin_duration_seconds`    | Histogram | `flight_id`, `status`      |
| `skyhigh_waitlist_depth`              | Gauge     | `flight_id`                |
| `skyhigh_waitlist_assignment_total`   | Counter   | `flight_id`                |
| `skyhigh_abuse_events_total`          | Counter   | `source_ip`                |
| `skyhigh_payment_request_duration_seconds` | Histogram | `status`              |
| `skyhigh_http_request_duration_seconds`    | Histogram | `method`, `path`, `status` |

**Endpoint:** `GET /metrics` (Prometheus scrape target)

### 10.3 Distributed Tracing (OpenTelemetry)

- Auto-instrumented: HTTP requests, TypeORM queries, Redis commands.
- Manual spans for: seat hold acquisition, waitlist processing, payment calls.
- Trace context propagated to stub services via `traceparent` header.

---

## 11. Infrastructure (Docker Compose)

### 11.1 Services

| Service              | Image / Build        | Ports         | Notes                                          |
| -------------------- | -------------------- | ------------- | ---------------------------------------------- |
| `app`                | Build from Dockerfile| 3000:3000     | NestJS application                             |
| `postgres`           | postgres:16-alpine   | 5432:5432     | Primary database                               |
| `redis`              | redis:7-alpine       | 6379:6379     | With `notify-keyspace-events Ex`               |
| `pgadmin`            | dpage/pgadmin4       | 5050:80       | Database inspection UI                         |
| `stub-payment`       | Build from stubs/    | 3001:3001     | Simulates payment processing                   |
| `stub-weight`        | Build from stubs/    | 3002:3002     | Simulates baggage weight lookup                |
| `stub-notification`  | Build from stubs/    | 3003:3003     | Simulates passenger notifications              |

### 11.2 Redis Configuration

```
notify-keyspace-events Ex
```

Enabled via Docker Compose command override:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --notify-keyspace-events Ex
```

### 11.3 Environment Variables

| Variable                | Default                          | Description                          |
| ----------------------- | -------------------------------- | ------------------------------------ |
| `NODE_ENV`              | `development`                    | Environment                          |
| `PORT`                  | `3000`                           | Application port                     |
| `DATABASE_URL`          | `postgresql://...`               | PostgreSQL connection string         |
| `REDIS_URL`             | `redis://redis:6379`             | Redis connection string              |
| `JWT_SECRET`            | (required)                       | Secret for JWT validation            |
| `SEAT_HOLD_TTL_SECONDS` | `120`                           | Hold duration                        |
| `SEAT_MAP_CACHE_TTL_MS` | `2000`                          | Seat map cache TTL in milliseconds   |
| `EXCESS_FEE_PER_KG`    | `10.00`                          | Excess baggage fee per kg            |
| `MAX_BAGGAGE_WEIGHT_KG` | `25`                            | Max allowed baggage weight           |
| `RATE_LIMIT_WINDOW_MS`  | `2000`                          | Sliding window duration              |
| `RATE_LIMIT_MAX_REQUESTS`| `50`                            | Max requests per window              |
| `PAYMENT_SERVICE_URL`   | `http://stub-payment:3001`       | Payment service base URL             |
| `WEIGHT_SERVICE_URL`    | `http://stub-weight:3002`        | Weight service base URL              |
| `NOTIFICATION_SERVICE_URL`| `http://stub-notification:3003`| Notification service base URL        |
| `SWEEP_INTERVAL_SECONDS`| `30`                             | Background sweep interval            |
| `ABUSE_RETENTION_DAYS`  | `90`                             | Minimum retention for abuse events   |

---

## 12. Testing Strategy

### 12.1 Unit Tests (Jest)

- **Scope:** Individual services, guards, middleware, utility functions.
- **Mocking:** All external dependencies (DB, Redis, HTTP clients) mocked via Jest.
- **Naming:** `When_<condition>_Then_<expected_result>`.
- **Coverage targets:** All seat state transitions, CAS logic, fee calculation, rate limiter logic.

### 12.2 Integration Tests (Jest + Testcontainers)

- **Scope:** Full request lifecycle through NestJS app with real PostgreSQL and Redis.
- **Testcontainers:** Spin up ephemeral Postgres and Redis containers per test suite.
- **Key scenarios:**
  - Concurrent seat hold (multiple parallel requests for same seat → exactly one wins).
  - Hold expiry (set hold, wait >120s, verify seat released).
  - Full check-in flow (hold → baggage → payment → confirm).
  - Waitlist auto-assignment on cancellation and hold expiry.
  - Rate limiter triggers at threshold.
  - CAS prevents double-release.

### 12.3 Load Tests (k6)

- **Target:** Validate P95 latency targets under simulated peak traffic.
- **Scenarios:**
  - Seat map retrieval under 500 concurrent users → P95 < 1s.
  - Seat hold acquisition under 200 concurrent users → P95 < 500ms.
  - End-to-end check-in under 100 concurrent users → P95 < 5s.
  - Abuse detection triggers correctly under bot-like traffic patterns.

---

## 13. Seed Data

Pre-seeded via TypeORM migrations or a dedicated seed script:

### 13.1 Aircraft Types

| Name | Rows | Columns       |
| ---- | ---- | ------------- |
| A320 | 30   | A,B,C,D,E,F   |
| B737 | 33   | A,B,C,D,E,F   |
| A380 | 50   | A,B,C,D,E,F,G,H,J,K |

### 13.2 Flights

| Flight Number | Aircraft | Departure              |
| ------------- | -------- | ---------------------- |
| SH-1042       | A320     | 2026-03-01T08:00:00Z   |
| SH-2085       | B737     | 2026-03-01T14:30:00Z   |
| SH-3001       | A380     | 2026-03-02T06:00:00Z   |

### 13.3 Passengers

10 sample passengers with UUIDs, names, and emails for testing.

---

## 14. Project Structure (Root)

```
sky-high-core/
├── src/                          # NestJS application source
├── stubs/                        # Stub services
│   ├── payment/                  # Stub payment service
│   ├── weight/                   # Stub weight service
│   └── notification/             # Stub notification service
├── test/                         # Integration & e2e tests
├── k6/                           # Load test scripts
├── migrations/                   # TypeORM migrations
├── seeds/                        # Seed data scripts
├── docker-compose.yml            # Local dev infrastructure
├── Dockerfile                    # App container
├── .env.example                  # Environment template
├── tsconfig.json
├── package.json
├── jest.config.ts
├── PRD.md                        # Product requirements
├── technical-prd.md              # This document
└── README.md
```
