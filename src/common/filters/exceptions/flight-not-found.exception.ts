import { DomainException } from '../domain.exception';
import { FLIGHT_NOT_FOUND } from '../error-types.constants';

/**
 * Thrown when the requested flight does not exist.
 */
export class FlightNotFoundException extends DomainException {
  constructor(detail = 'The requested flight was not found') {
    super(FLIGHT_NOT_FOUND, detail);
  }
}
