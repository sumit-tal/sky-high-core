/**
 * Notification event types supported by the notification service.
 */
export enum NotificationEventType {
  WAITLIST_SEAT_ASSIGNED = "WAITLIST_SEAT_ASSIGNED",
  HOLD_EXPIRY_WARNING = "HOLD_EXPIRY_WARNING",
}

/**
 * Payload emitted by WaitlistService when a seat is assigned to a waitlisted passenger.
 */
export interface WaitlistNotificationPayload {
  readonly passengerId: string;
  readonly flightId: string;
  readonly seatId: string;
  readonly waitlistEntryId: string;
}

/**
 * Request body sent to the stub Notification Service.
 */
export interface NotificationRequest {
  readonly type: string;
  readonly passengerId: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Response from the stub Notification Service.
 */
export interface NotificationResponse {
  readonly notificationId: string;
  readonly type: string;
  readonly passengerId: string;
  readonly status: string;
  readonly timestamp: string;
}
