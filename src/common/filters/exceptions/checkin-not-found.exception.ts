import { DomainException } from '../domain.exception';
import { CHECKIN_NOT_FOUND } from '../error-types.constants';

/**
 * Thrown when the requested check-in does not exist.
 */
export class CheckInNotFoundException extends DomainException {
  constructor(detail = 'The requested check-in was not found') {
    super(CHECKIN_NOT_FOUND, detail);
  }
}
