# 014 - Waitlist Module

## Description

Implement the waitlist system with FIFO queue management and automatic seat assignment when seats become available.

## Tasks

- [ ] Create `waitlist/` module, controller, service, entity
- [ ] Implement endpoints:
  - `POST /api/v1/flights/:flightId/waitlist` — Join waitlist
    - Passenger ID from JWT
    - Auto-assign FIFO position (per flight)
    - Return 409 (`already-on-waitlist`) if duplicate
    - Return 201 with position and status
  - `DELETE /api/v1/waitlist/:id` — Leave waitlist
    - Set status = CANCELLED
  - `GET /api/v1/flights/:flightId/waitlist` — Get waitlist status for flight
- [ ] Implement auto-assignment flow (Technical PRD §7.1):
  - Triggered when a seat transitions to AVAILABLE (hold expiry or cancellation)
  1. Acquire Redlock on `lock:waitlist:{flightId}`
  2. SELECT next WAITING passenger (ORDER BY position ASC, LIMIT 1)
  3. If no waiting passenger → release lock, seat stays AVAILABLE
  4. If found → assign seat using the same hold flow as task 010:
     - Seat → HELD (120s TTL)
     - Waitlist entry → ASSIGNED
     - Create check_in record
     - Audit log (WAITLIST_ASSIGNED)
  5. Emit notification event (stub notification service)
  6. Release lock
- [ ] Handle waitlist hold expiry (Technical PRD §7.2):
  - If waitlist-assigned hold expires → seat back to AVAILABLE
  - Trigger waitlist processing again → next FIFO passenger
  - Expired passenger's waitlist status → EXPIRED
- [ ] Create request/response DTOs

## Acceptance Criteria

- Passengers can join waitlist in FIFO order
- Auto-assignment gives the next waiting passenger a 120s hold
- If waitlist-assigned hold expires, seat goes to next in queue (not general availability)
- Notification is emitted on assignment
- Concurrent waitlist processing is serialized via Redlock
