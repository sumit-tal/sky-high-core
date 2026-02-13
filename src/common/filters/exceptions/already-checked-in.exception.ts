import { DomainException } from '../domain.exception';
import { ALREADY_CHECKED_IN } from '../error-types.constants';

/**
 * Thrown when a passenger has already checked in for a flight.
 */
export class AlreadyCheckedInException extends DomainException {
  constructor(detail = 'Passenger has already checked in for this flight') {
    super(ALREADY_CHECKED_IN, detail);
  }
}
