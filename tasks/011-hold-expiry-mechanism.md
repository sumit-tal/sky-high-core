# 011 - Hold Expiry: Keyspace Notifications & Background Sweep

## Description

Implement the dual-mechanism hold expiry system: Redis keyspace notifications (primary) and a background sweep job (fallback) to ensure seats are never stuck in HELD state.

## Tasks

- [ ] Create `hold-expiry.service.ts` in `check-in/` module
- [ ] **Primary — Redis Keyspace Notification Listener:**
  - Subscribe to `__keyevent@0__:expired` channel
  - On `hold:{seatId}` expiry:
    1. Acquire Redlock on `lock:seat:{seatId}`
    2. Read seat from DB; verify `status == HELD` and `held_at + 120s <= NOW()` (CAS)
    3. UPDATE seat: status=AVAILABLE, held_by=NULL, held_at=NULL (CAS guard)
    4. UPDATE check_in: status=CANCELLED (if not already confirmed)
    5. INSERT audit_log (SEAT_RELEASED)
    6. Trigger waitlist processing for the flight
    7. Invalidate seat map cache
    8. Release lock
- [ ] **Fallback — Background Sweep Job:**
  - `@Cron('*/30 * * * * *')` — every 30 seconds (configurable via `SWEEP_INTERVAL_SECONDS`)
  - Query: `SELECT * FROM seat WHERE status = 'HELD' AND held_at + INTERVAL '120 seconds' < NOW()`
  - For each stale hold, execute the same release logic as the keyspace listener
- [ ] Ensure at-most-once semantics via CAS pattern:
  ```sql
  UPDATE seat SET status = 'AVAILABLE', held_by = NULL, held_at = NULL
  WHERE id = :seatId AND status = 'HELD' AND held_by = :passengerId;
  ```
  - `rows_affected == 0` → already released → no-op

## Acceptance Criteria

- Held seats are automatically released after 120 seconds
- Both keyspace notification and sweep job use the same CAS release logic
- Double-release is prevented (at-most-once guarantee)
- Waitlist processing is triggered after hold release
- System recovers correctly even if the app restarts mid-hold
