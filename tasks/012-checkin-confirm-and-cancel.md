# 012 - Check-In: Confirm & Cancel

## Description

Implement check-in confirmation (with baggage validation and payment gating) and cancellation flows.

## Tasks

- [ ] Implement `PATCH /api/v1/check-ins/:id` — Confirm check-in:
  - Validate hold is not expired → 410 (`hold-expired`) if expired
  - Accept `{ baggageWeight, action: "CONFIRM" }`
  - Call Weight Service (stub) to validate baggage weight
  - If weight <= 25 kg → proceed to confirm
  - If weight > 25 kg:
    1. Calculate excess fee: `(weight - 25) * EXCESS_FEE_PER_KG`
    2. Set check_in status = AWAITING_PAYMENT
    3. Call Payment Service (stub) — sync HTTP with timeout + retry
    4. If payment fails/timeout → return 200 with AWAITING_PAYMENT status
    5. If payment confirmed → proceed to confirm
  - On confirm:
    - BEGIN TRANSACTION:
      - UPDATE seat: status=CONFIRMED
      - UPDATE check_in: status=COMPLETED, payment_id (if applicable)
      - INSERT audit_log (SEAT_CONFIRMED, CHECKIN_COMPLETED)
    - Delete Redis hold key
    - Invalidate seat map cache
- [ ] Implement `GET /api/v1/check-ins/:id` — Get check-in status
- [ ] Implement `DELETE /api/v1/check-ins/:id` — Cancel check-in:
  - Verify flight has not departed → 403 (`cancellation-not-allowed`)
  - BEGIN TRANSACTION:
    - UPDATE seat: status=AVAILABLE, held_by=NULL, held_at=NULL (if HELD or CONFIRMED)
    - UPDATE check_in: status=CANCELLED
    - INSERT audit_log (SEAT_CANCELLED, CHECKIN_CANCELLED)
  - Delete Redis hold key (if exists)
  - Invalidate seat map cache
  - Trigger waitlist processing for the flight
- [ ] Create request/response DTOs for all operations

## Acceptance Criteria

- Check-in confirms only within the 120s hold window
- Baggage over 25 kg triggers payment flow
- Payment failure pauses check-in (does not fail it)
- Cancellation releases the seat and triggers waitlist
- All state transitions are audited
