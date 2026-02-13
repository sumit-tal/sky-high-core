# 003 - Database Setup, Entities & Migrations

## Description

Configure TypeORM with PostgreSQL, define all entities with enums, create migrations, and set up the seed data.

## Tasks

- [ ] Configure TypeORM in `common/database/` (DataSource, connection options)
- [ ] Define enums: `SeatStatus`, `FlightStatus`, `CheckInStatus`, `WaitlistStatus`, `AuditAction`
- [ ] Create TypeORM entities:
  - `AircraftType` — id, name, rows, columns, timestamps
  - `Flight` — id, flight_number, aircraft_type_id (FK), departure_time, status, timestamps
  - `Passenger` — id, first_name, last_name, email (unique), timestamps
  - `Seat` — id, flight_id (FK), row, column, status, held_by (FK), held_at, timestamps
  - `CheckIn` — id, passenger_id (FK), flight_id (FK), seat_id (FK), status, baggage_weight, excess_fee, payment_id, timestamps
  - `Waitlist` — id, flight_id (FK), passenger_id (FK), position, status, timestamps
  - `AuditLog` — id, entity_type, entity_id, action, from_state, to_state, actor_id, metadata (jsonb), created_at
  - `AbuseEvent` — id, source_ip, request_count, window_start, window_end, details (jsonb), created_at
- [ ] Add indexes as specified in Technical PRD §2.3:
  - `UNIQUE (flight_id, row, column)` on seat
  - `INDEX (flight_id, status)` on seat
  - `INDEX (held_by)` on seat
  - `UNIQUE (passenger_id, flight_id)` on check_in
  - `UNIQUE (flight_id, passenger_id)` on waitlist
  - `INDEX (flight_id, status, position)` on waitlist
  - `INDEX (entity_type, entity_id)` on audit_log
  - `INDEX (created_at)` on audit_log
  - `INDEX (source_ip, created_at)` on abuse_event
- [ ] Generate TypeORM migrations
- [ ] Create seed script (`seeds/`) with:
  - 3 aircraft types (A320, B737, A380)
  - 3 flights (SH-1042, SH-2085, SH-3001)
  - Seats generated from aircraft type templates
  - 10 sample passengers

## Acceptance Criteria

- `npm run migration:run` applies all migrations without errors
- `npm run seed` populates the database with reference data
- All entities, relationships, and indexes are correctly created in PostgreSQL
