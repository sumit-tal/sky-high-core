# 019 - Unit Tests

## Description

Write comprehensive unit tests for all services, guards, middleware, and utility functions using Jest.

## Tasks

- [ ] **Seat Service Tests:**
  - When seat is available Then return seat map from cache
  - When cache miss Then fetch from DB and cache result
  - When flight not found Then throw 404
- [ ] **Check-In Service Tests:**
  - When seat is available Then hold succeeds and returns check-in
  - When seat is already held Then return 409
  - When passenger already checked in Then return 409
  - When hold expired Then confirm returns 410
  - When baggage under limit Then confirm without payment
  - When baggage over limit Then trigger payment flow
  - When payment fails Then return AWAITING_PAYMENT status
  - When cancellation before departure Then succeed
  - When cancellation after departure Then return 403
- [ ] **Hold Expiry Service Tests:**
  - When hold expires Then seat becomes available
  - When hold already released (CAS) Then no-op
  - When hold expires Then waitlist processing is triggered
- [ ] **Waitlist Service Tests:**
  - When joining waitlist Then assign FIFO position
  - When already on waitlist Then return 409
  - When seat becomes available Then assign to next waiting passenger
  - When no waiting passengers Then seat stays available
  - When waitlist-assigned hold expires Then next passenger gets seat
- [ ] **Baggage Service Tests:**
  - When weight under limit Then no fee
  - When weight over limit Then calculate correct fee
- [ ] **Payment Service Tests:**
  - When payment succeeds Then return confirmation
  - When payment times out Then return failure
  - When payment retries Then use exponential backoff
- [ ] **Rate Limiter Middleware Tests:**
  - When under threshold Then allow request
  - When at threshold Then return 429
  - When window expires Then reset count
- [ ] **JWT Guard Tests:**
  - When valid token Then extract passenger ID
  - When expired token Then return 401
  - When missing token Then return 401
- [ ] **Audit Service Tests:**
  - When logging event Then insert audit record

## Acceptance Criteria

- All services have unit tests with mocked dependencies
- Test naming follows `When_<condition>_Then_<expected>` convention
- All seat state transitions and CAS logic are covered
- `npm run test` passes with no failures
