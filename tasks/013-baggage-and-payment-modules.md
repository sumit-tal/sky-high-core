# 013 - Baggage & Payment Modules

## Description

Implement the baggage validation service (fee calculation) and the payment integration service (sync HTTP client to stub).

## Tasks

- [ ] Create `baggage/` module and service:
  - Weight validation logic (compare against `MAX_BAGGAGE_WEIGHT_KG`)
  - Excess fee calculation: `(weight - MAX_BAGGAGE_WEIGHT_KG) * EXCESS_FEE_PER_KG`
  - Call stub Weight Service via HTTP to get/validate weight
  - Create DTOs
- [ ] Create `payment/` module and service:
  - Sync HTTP client to stub Payment Service (`PAYMENT_SERVICE_URL`)
  - Implement timeout handling
  - Implement exponential backoff retry (configurable max retries)
  - Return payment confirmation with external reference ID
  - Handle payment failure gracefully (return failure, don't throw)
  - Audit log entries: PAYMENT_REQUESTED, PAYMENT_CONFIRMED

## Acceptance Criteria

- Baggage fee is correctly calculated for overweight luggage
- Payment service is called with timeout and retry
- Payment failure does not crash the check-in flow
- Configuration is driven by environment variables
