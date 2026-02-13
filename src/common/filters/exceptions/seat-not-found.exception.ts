import { DomainException } from '../domain.exception';
import { SEAT_NOT_FOUND } from '../error-types.constants';

/**
 * Thrown when the requested seat does not exist.
 */
export class SeatNotFoundException extends DomainException {
  constructor(detail = 'The requested seat was not found') {
    super(SEAT_NOT_FOUND, detail);
  }
}
