import { DomainException } from '../domain.exception';
import { ALREADY_ON_WAITLIST } from '../error-types.constants';

/**
 * Thrown when a passenger is already on the waitlist for a flight.
 */
export class AlreadyOnWaitlistException extends DomainException {
  constructor(detail = 'Passenger is already on the waitlist for this flight') {
    super(ALREADY_ON_WAITLIST, detail);
  }
}
