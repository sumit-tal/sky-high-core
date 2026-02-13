# 010 - Check-In Module: Seat Hold (Start Check-In)

## Description

Implement the check-in initiation flow: passenger selects a seat, acquires a distributed lock, holds the seat with a 120s TTL, and creates a check-in record.

## Tasks

- [ ] Create `check-in/` module, controller, service, entity
- [ ] Implement `POST /api/v1/check-ins` endpoint:
  - Request body: `{ flightId, seatId }`
  - Passenger ID from JWT (`@CurrentUser`)
- [ ] Implement seat hold flow (Technical PRD §6.1):
  1. Acquire Redlock on `lock:seat:{seatId}` (TTL: 5s)
  2. Read seat status from DB
  3. If status != AVAILABLE → release lock, return 409 (`seat-already-held`)
  4. BEGIN TRANSACTION:
     - UPDATE seat: status=HELD, held_by=passengerId, held_at=NOW() (CAS guard)
     - INSERT check_in record (status=IN_PROGRESS)
     - INSERT audit_log (SEAT_HELD)
  5. SET Redis key `hold:{seatId}` = passengerId, EX 120
  6. Release Redlock
  7. Invalidate seat map cache for the flight
- [ ] Create request/response DTOs
- [ ] Handle edge cases:
  - Passenger already has active check-in for this flight → 409 (`already-checked-in`)
  - Seat not found → 404 (`seat-not-found`)
  - Flight not found → 404 (`flight-not-found`)
- [ ] Return 201 with hold info including `holdExpiresAt`

## Acceptance Criteria

- Only one passenger can hold a given seat at a time
- Concurrent requests for the same seat: exactly one succeeds, others get 409
- Check-in record is created with status IN_PROGRESS
- Redis hold key is set with 120s TTL
- Audit log entry is created
- Seat map cache is invalidated
