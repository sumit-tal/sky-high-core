import { DomainException } from '../domain.exception';
import { SEAT_ALREADY_HELD } from '../error-types.constants';

/**
 * Thrown when a passenger attempts to hold a seat that is already held.
 */
export class SeatAlreadyHeldException extends DomainException {
  constructor(detail = 'The requested seat is already held by another passenger') {
    super(SEAT_ALREADY_HELD, detail);
  }
}
