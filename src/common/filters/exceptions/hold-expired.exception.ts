import { DomainException } from '../domain.exception';
import { HOLD_EXPIRED } from '../error-types.constants';

/**
 * Thrown when a seat hold has expired.
 */
export class HoldExpiredException extends DomainException {
  constructor(detail = 'The seat hold has expired') {
    super(HOLD_EXPIRED, detail);
  }
}
