import { DomainException } from '../domain.exception';
import { WAITLIST_NOT_FOUND } from '../error-types.constants';

/**
 * Thrown when a waitlist entry is not found.
 */
export class WaitlistNotFoundException extends DomainException {
  constructor(detail = 'No waitlist entry found with the given ID') {
    super(WAITLIST_NOT_FOUND, detail);
  }
}
