import { DomainException } from '../domain.exception';
import { CANCELLATION_NOT_ALLOWED } from '../error-types.constants';

/**
 * Thrown when cancellation is not permitted for a check-in.
 */
export class CancellationNotAllowedException extends DomainException {
  constructor(detail = 'Cancellation is not allowed for this check-in') {
    super(CANCELLATION_NOT_ALLOWED, detail);
  }
}
