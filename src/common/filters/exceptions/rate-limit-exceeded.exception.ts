import { DomainException } from '../domain.exception';
import { RATE_LIMIT_EXCEEDED } from '../error-types.constants';

/**
 * Thrown when the client has exceeded the rate limit.
 */
export class RateLimitExceededException extends DomainException {
  constructor(detail = 'Rate limit exceeded, please try again later') {
    super(RATE_LIMIT_EXCEEDED, detail);
  }
}
