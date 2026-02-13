# SkyHigh Core – Digital Check-In System

## Product Requirements Document (PRD)

---

## 1. Problem Statement

SkyHigh Airlines operates a self-service airport check-in system that faces severe reliability and performance challenges during peak-hour traffic. When popular flights open their check-in windows, hundreds of passengers simultaneously attempt to select seats, add baggage, and complete check-in — creating a high-contention environment prone to:

- **Seat conflicts** — Multiple passengers being assigned the same seat due to race conditions.
- **Stale seat maps** — Passengers seeing outdated availability, leading to failed reservations and poor UX.
- **Abandoned holds blocking inventory** — Seats locked indefinitely when passengers drop off mid-flow, reducing availability for others.
- **Unchecked baggage overages** — Passengers bypassing weight limits without paying excess fees, causing revenue leakage and compliance issues.
- **Bot / abuse traffic** — Automated scripts scraping seat maps at scale, degrading system performance for legitimate users.

The current system lacks the concurrency controls, time-bound reservation logic, and abuse detection needed to operate reliably at scale. **SkyHigh Core** is the backend service designed to solve these problems.

---

## 2. Goals

| #   | Goal                                    | Success Criteria                                                                                                                                            |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **No seat overlaps**                    | A seat can only be assigned to exactly one passenger at any point in time, even under concurrent requests.                                                  |
| G2  | **Time-bound seat holds**               | Held seats auto-release after 120 seconds if check-in is not completed, ensuring inventory is never permanently locked.                                     |
| G3  | **Fast check-in experience**            | Seat map retrieval P95 latency < 1 second; end-to-end check-in completes within seconds under normal load.                                                  |
| G4  | **Baggage validation & payment gating** | Check-in is paused when baggage exceeds 25 kg until the excess fee is paid; no bypass is possible.                                                          |
| G5  | **Waitlist fairness**                   | When a seat becomes available (cancellation or expired hold), it is automatically offered to the next eligible waitlisted passenger in FIFO order.          |
| G6  | **Abuse / bot detection**               | Anomalous access patterns (e.g., 50 seat-map requests in 2 seconds from a single source) are detected, throttled, and logged for audit.                     |
| G7  | **Reliable cancellation**               | Passengers can cancel a confirmed check-in before departure; the freed seat is immediately recycled into the availability pool or assigned to the waitlist. |

---

## 3. Key Users

### 3.1 Passenger (Primary)

- Self-service traveller using airport kiosks, mobile apps, or web portals.
- **Needs:** Browse available seats, select and hold a seat, add baggage, complete check-in, cancel if plans change, join a waitlist when preferred seats are unavailable.
- **Expectations:** Real-time seat availability, fast response times, clear feedback on hold expiry and payment requirements.

### 3.2 Airline Operations Staff

- Ground staff and operations teams monitoring check-in flow.
- **Needs:** Visibility into seat assignment status, waitlist queues, and check-in completion rates across flights.
- **Expectations:** Accurate, near real-time dashboards; ability to intervene in edge cases (e.g., manual seat reassignment).

### 3.3 Security / Anti-Abuse Team

- Internal team responsible for platform integrity.
- **Needs:** Audit logs of flagged abuse events, ability to review and adjust throttling rules.
- **Expectations:** Automated detection with minimal false positives; clear event records for investigation.

### 3.4 Downstream Systems (Internal Consumers)

- **Payment Service** — Receives excess-baggage fee requests; returns payment confirmation.
- **Weight Service** — Provides baggage weight validation.
- **Notification Service** — Delivers waitlist assignment and hold-expiry alerts to passengers.

---

## 4. Functional Requirements

### 4.1 Seat Lifecycle Management

Seats follow a strict state machine:

```
AVAILABLE → HELD → CONFIRMED → CANCELLED
                                    ↓
                                AVAILABLE
```

| Transition            | Trigger                      | Rules                                                                                                     |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| AVAILABLE → HELD      | Passenger selects a seat     | Only if seat is currently AVAILABLE; exclusive to one passenger.                                          |
| HELD → CONFIRMED      | Passenger completes check-in | Must occur within 120-second hold window; baggage validation and payment (if applicable) must be cleared. |
| HELD → AVAILABLE      | Hold expires (120 s)         | Automatic; no passenger action required. System must reliably enforce this even under high load.          |
| CONFIRMED → CANCELLED | Passenger cancels            | Allowed before departure. Seat transitions to AVAILABLE or is assigned to next waitlisted passenger.      |

### 4.2 Conflict-Free Seat Assignment

- If multiple passengers attempt to reserve the same seat concurrently, **exactly one** must succeed; all others receive a clear rejection.
- No race condition may result in duplicate assignments.
- Consistency must hold regardless of request volume.

### 4.3 Time-Bound Seat Hold

- Hold duration: **120 seconds** (exactly).
- During the hold window, no other passenger can reserve or confirm the same seat.
- Expiry must be automatic and reliable — not dependent on client-side timers.

### 4.4 Cancellation

- Passengers may cancel a confirmed check-in any time before departure.
- Cancelled seats are immediately made AVAILABLE or offered to the next waitlisted passenger.

### 4.5 Waitlist

- Passengers can join a waitlist when their desired seat (or any seat on a flight) is unavailable.
- When a seat becomes AVAILABLE (via cancellation or hold expiry), the system **automatically assigns** it to the next eligible waitlisted passenger (FIFO).
- The passenger is notified upon assignment.

### 4.6 Baggage Validation & Payment Gating

- Maximum allowed baggage weight: **25 kg**.
- If weight exceeds the limit:
  1. Check-in is **paused**.
  2. An excess-baggage fee is calculated and sent to the Payment Service.
  3. Check-in may only resume after **successful payment confirmation**.
- Check-in status must clearly reflect one of: `IN_PROGRESS`, `AWAITING_PAYMENT`, `COMPLETED`.

### 4.7 Seat Map Browsing

- The most frequently accessed endpoint.
- Must return current seat availability for a given flight.
- Data must be accurate and near real-time.

### 4.8 Abuse & Bot Detection

- Detect when a single source accesses ≥ 50 distinct seat maps within a 2-second sliding window.
- On detection:
  - **Temporarily block or throttle** the source.
  - **Log the event** with source identifier, timestamp, and request details for audit.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance

| Metric                      | Target                                  |
| --------------------------- | --------------------------------------- |
| Seat map retrieval (P95)    | < 1 second                              |
| Seat hold acquisition (P95) | < 500 ms                                |
| End-to-end check-in (P95)   | < 5 seconds (excluding payment wait)    |
| Concurrent users supported  | Hundreds per flight during peak windows |

### 5.2 Consistency & Correctness

- **Strong consistency** for seat state transitions — no double-booking under any load.
- Distributed locking or equivalent concurrency control must be used for seat reservation.
- Hold expiry must be enforced server-side with **at-most-once** semantics (a seat must not be released more than once or held beyond its TTL).

### 5.3 Availability & Resilience

- Target uptime: **99.9%** during check-in windows.
- Graceful degradation: if the Payment Service is temporarily unavailable, check-in should pause (not fail) and resume when payment is confirmed.
- Hold expiry mechanism must function correctly even if the application restarts mid-hold.

### 5.4 Scalability

- Horizontally scalable — adding service instances must not break seat consistency.
- Seat map reads should be cacheable with short TTLs to absorb read spikes without sacrificing accuracy.
- Waitlist processing must scale with the number of flights and passengers without bottlenecks.

### 5.5 Security

- All API endpoints must be authenticated and authorized.
- Rate limiting must be enforced at the API gateway and application layers.
- Abuse detection events must be immutable and retained for a minimum of **90 days**.

### 5.6 Observability

- Structured logging for all state transitions (seat hold, confirm, cancel, waitlist assign).
- Metrics exported for: request latency, seat contention rate, hold expiry count, waitlist depth, abuse events.
- Distributed tracing across service boundaries (Weight Service, Payment Service, Notification Service).

### 5.7 Data Integrity

- All seat state changes must be **transactional** — partial updates must not be visible.
- Audit trail for every seat transition: who, when, from-state, to-state.
- Baggage payment records must be linked to the corresponding check-in record.

### 5.8 Testability

- All concurrency-sensitive paths (seat hold, conflict resolution, hold expiry) must have automated tests simulating concurrent access.
- Integration tests must cover the full check-in flow including baggage validation and payment gating.
- Load tests must validate P95 targets under simulated peak traffic.

---

## 6. Out of Scope

- Flight scheduling and gate assignment.
- Boarding pass generation and printing.
- Loyalty program integration.
- Payment processing internals (simulated as an external service).
- Weight measurement hardware integration (simulated as an external service).

---

## 7. Key Risks & Mitigations

| Risk                                  | Impact                             | Mitigation                                                                                                |
| ------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Race conditions on seat reservation   | Double-booking                     | Distributed locking (e.g., Redis-based) with atomic state transitions.                                    |
| Hold expiry not firing under load     | Seats stuck in HELD state          | Server-side TTL (e.g., Redis key expiry) independent of application timers; background sweep as fallback. |
| Payment Service downtime              | Check-in blocked indefinitely      | Timeout + retry with exponential backoff; clear AWAITING_PAYMENT status communicated to passenger.        |
| Bot traffic overwhelming seat map API | Degraded experience for real users | Sliding-window rate limiter + temporary IP/source blocking; cached seat maps to reduce backend load.      |
| Waitlist starvation                   | Passengers never assigned seats    | FIFO ordering with monitoring on queue depth and assignment latency.                                      |
