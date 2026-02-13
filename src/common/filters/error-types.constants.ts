import { HttpStatus } from '@nestjs/common';

const BASE_PROBLEM_URI = 'https://skyhigh.com/problems';

/**
 * Standard domain error type definition for RFC 7807 responses.
 */
export interface ErrorType {
  readonly type: string;
  readonly title: string;
  readonly status: number;
}

const buildErrorType = (slug: string, title: string, status: number): ErrorType => ({
  type: `${BASE_PROBLEM_URI}/${slug}`,
  title,
  status,
});

/** Seat is already held by another passenger. */
export const SEAT_ALREADY_HELD = buildErrorType('seat-already-held', 'Seat Already Held', HttpStatus.CONFLICT);

/** Hold has expired and is no longer valid. */
export const HOLD_EXPIRED = buildErrorType('hold-expired', 'Hold Expired', HttpStatus.GONE);

/** Payment is required to complete the operation. */
export const PAYMENT_REQUIRED = buildErrorType('payment-required', 'Payment Required', HttpStatus.PAYMENT_REQUIRED);

/** The requested flight was not found. */
export const FLIGHT_NOT_FOUND = buildErrorType('flight-not-found', 'Flight Not Found', HttpStatus.NOT_FOUND);

/** The requested seat was not found. */
export const SEAT_NOT_FOUND = buildErrorType('seat-not-found', 'Seat Not Found', HttpStatus.NOT_FOUND);

/** The requested check-in was not found. */
export const CHECKIN_NOT_FOUND = buildErrorType('checkin-not-found', 'Check-In Not Found', HttpStatus.NOT_FOUND);

/** Passenger has already checked in for this flight. */
export const ALREADY_CHECKED_IN = buildErrorType('already-checked-in', 'Already Checked In', HttpStatus.CONFLICT);

/** Passenger is already on the waitlist for this flight. */
export const ALREADY_ON_WAITLIST = buildErrorType('already-on-waitlist', 'Already On Waitlist', HttpStatus.CONFLICT);

/** Cancellation is not allowed for this check-in. */
export const CANCELLATION_NOT_ALLOWED = buildErrorType('cancellation-not-allowed', 'Cancellation Not Allowed', HttpStatus.FORBIDDEN);

/** Rate limit has been exceeded. */
export const RATE_LIMIT_EXCEEDED = buildErrorType('rate-limit-exceeded', 'Rate Limit Exceeded', HttpStatus.TOO_MANY_REQUESTS);

/** Authentication is required. */
export const UNAUTHORIZED = buildErrorType('unauthorized', 'Unauthorized', HttpStatus.UNAUTHORIZED);

/** Generic bad request. */
export const BAD_REQUEST = buildErrorType('bad-request', 'Bad Request', HttpStatus.BAD_REQUEST);

/** Generic internal server error. */
export const INTERNAL_ERROR = buildErrorType('internal-error', 'Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);

/**
 * Fallback mapping from HTTP status code to a generic ErrorType.
 */
export const STATUS_ERROR_TYPE_MAP: Readonly<Record<number, ErrorType>> = {
  [HttpStatus.BAD_REQUEST]: BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: UNAUTHORIZED,
  [HttpStatus.PAYMENT_REQUIRED]: PAYMENT_REQUIRED,
  [HttpStatus.FORBIDDEN]: CANCELLATION_NOT_ALLOWED,
  [HttpStatus.NOT_FOUND]: buildErrorType('not-found', 'Not Found', HttpStatus.NOT_FOUND),
  [HttpStatus.CONFLICT]: buildErrorType('conflict', 'Conflict', HttpStatus.CONFLICT),
  [HttpStatus.GONE]: HOLD_EXPIRED,
  [HttpStatus.TOO_MANY_REQUESTS]: RATE_LIMIT_EXCEEDED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: INTERNAL_ERROR,
} as const;
