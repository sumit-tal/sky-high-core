# 015 - Notification Module

## Description

Implement the notification integration module for sending passenger notifications via the stub notification service.

## Tasks

- [ ] Create `notification/` module and service
- [ ] Implement HTTP client to stub Notification Service (`NOTIFICATION_SERVICE_URL`)
- [ ] Define notification event types:
  - Waitlist seat assignment
  - Hold expiry warning (optional)
- [ ] Fire-and-forget pattern (don't block main flow on notification failure)
- [ ] Log notification attempts and failures

## Acceptance Criteria

- Notifications are sent to the stub service on waitlist assignment
- Notification failures are logged but do not block the main flow
- Notification payloads include passenger ID, flight ID, and seat details
