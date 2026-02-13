import { HttpException } from '@nestjs/common';
import { ErrorType } from './error-types.constants';

/**
 * Base domain exception that carries an RFC 7807 ErrorType.
 * All domain-specific exceptions extend this class.
 */
export class DomainException extends HttpException {
  readonly errorType: ErrorType;

  constructor(errorType: ErrorType, detail: string) {
    super(detail, errorType.status);
    this.errorType = errorType;
  }
}
