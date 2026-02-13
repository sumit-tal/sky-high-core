# 021 - Load Tests (k6)

## Description

Create k6 load test scripts to validate P95 latency targets under simulated peak traffic.

## Tasks

- [ ] Set up `k6/` directory with test scripts
- [ ] **Seat Map Retrieval Load Test:**
  - 500 concurrent virtual users
  - Target: P95 < 1 second
  - Duration: 2 minutes
- [ ] **Seat Hold Acquisition Load Test:**
  - 200 concurrent virtual users
  - Target: P95 < 500ms
  - Duration: 2 minutes
- [ ] **End-to-End Check-In Load Test:**
  - 100 concurrent virtual users
  - Target: P95 < 5 seconds (excluding payment wait)
  - Full flow: hold → baggage → confirm
- [ ] **Abuse Detection Load Test:**
  - Simulate bot-like traffic (>50 requests/2s from single source)
  - Verify 429 responses trigger correctly under load
- [ ] Create k6 configuration with thresholds
- [ ] Add helper scripts for running load tests against Docker Compose environment

## Acceptance Criteria

- All P95 latency targets are met under specified concurrency
- k6 scripts are runnable with `k6 run <script>`
- Results include pass/fail thresholds
- Abuse detection works correctly under load
