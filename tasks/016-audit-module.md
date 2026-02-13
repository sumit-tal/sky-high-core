# 016 - Audit Module

## Description

Implement the append-only audit logging system for all state transitions and the abuse event recording.

## Tasks

- [ ] Create `audit/` module and service
- [ ] Implement `AuditService.log()` method:
  - Accept: entity_type, entity_id, action, from_state, to_state, actor_id, metadata
  - Insert into `audit_log` table (append-only, immutable)
  - Non-blocking (should not slow down main operations)
- [ ] Implement `AbuseEventService.record()` method:
  - Accept: source_ip, request_count, window_start, window_end, details
  - Insert into `abuse_event` table (immutable)
- [ ] Create scheduled cleanup job:
  - Delete abuse_event records older than `ABUSE_RETENTION_DAYS` (default 90 days)
  - Run daily
- [ ] Integrate audit logging into all modules:
  - Seat hold, confirm, release, cancel
  - Check-in start, complete, cancel
  - Waitlist join, assign
  - Payment request, confirm
  - Abuse detection

## Acceptance Criteria

- Every seat and check-in state transition is recorded in audit_log
- Abuse events are persisted with full context
- Records older than 90 days are cleaned up automatically
- Audit logging does not degrade main request performance
