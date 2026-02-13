# 020 - Integration Tests (Testcontainers)

## Description

Write integration tests using Jest + Testcontainers with real PostgreSQL and Redis instances to validate end-to-end flows.

## Tasks

- [ ] Set up Testcontainers configuration:
  - PostgreSQL container (run migrations + seed)
  - Redis container (with keyspace notifications enabled)
- [ ] **Concurrent Seat Hold Test:**
  - Fire N parallel requests for the same seat
  - Assert exactly one succeeds (201), all others get 409
- [ ] **Hold Expiry Test:**
  - Hold a seat, wait >120s, verify seat is released to AVAILABLE
- [ ] **Full Check-In Flow Test:**
  - Hold seat → add baggage (under limit) → confirm → verify COMPLETED
- [ ] **Check-In with Payment Test:**
  - Hold seat → add overweight baggage → payment triggered → confirm
- [ ] **Cancellation Test:**
  - Complete check-in → cancel → verify seat is AVAILABLE
  - Cancel → verify waitlist processing is triggered
- [ ] **Waitlist Auto-Assignment Test:**
  - All seats held → passenger joins waitlist → seat expires → waitlist passenger gets hold
- [ ] **Waitlist Hold Expiry Test:**
  - Waitlist-assigned hold expires → next FIFO passenger gets the seat
- [ ] **Rate Limiter Integration Test:**
  - Send 50+ requests in 2s → verify 429 response and abuse_event record
- [ ] **CAS Double-Release Test:**
  - Trigger both keyspace notification and sweep for same seat → only one release

## Acceptance Criteria

- All integration tests pass with real PostgreSQL and Redis
- Concurrent tests validate exactly-one-wins semantics
- Tests are isolated (each suite gets fresh containers)
- `npm run test:integration` passes
