import { DomainException } from '../domain.exception';
import { PAYMENT_REQUIRED } from '../error-types.constants';

/**
 * Thrown when payment is required to complete an operation.
 */
export class PaymentRequiredException extends DomainException {
  constructor(detail = 'Payment is required to complete this operation') {
    super(PAYMENT_REQUIRED, detail);
  }
}
