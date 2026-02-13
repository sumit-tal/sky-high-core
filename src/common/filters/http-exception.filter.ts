import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

const BASE_PROBLEM_URI = 'https://skyhigh.com/problems';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const detail =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as Record<string, unknown>)['message'] ?? exception.message;
    const problemDetails: ProblemDetails = {
      type: `${BASE_PROBLEM_URI}/${this.getTypeSlug(status)}`,
      title: this.getTitle(status),
      status,
      detail: Array.isArray(detail) ? detail.join('; ') : String(detail),
      instance: request.url,
    };
    response.status(status).json(problemDetails);
  }

  private getTypeSlug(status: number): string {
    const slugMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'bad-request',
      [HttpStatus.UNAUTHORIZED]: 'unauthorized',
      [HttpStatus.FORBIDDEN]: 'forbidden',
      [HttpStatus.NOT_FOUND]: 'not-found',
      [HttpStatus.CONFLICT]: 'conflict',
      [HttpStatus.GONE]: 'gone',
      [HttpStatus.PAYMENT_REQUIRED]: 'payment-required',
      [HttpStatus.TOO_MANY_REQUESTS]: 'rate-limit-exceeded',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal-error',
    };
    return slugMap[status] ?? 'unknown-error';
  }

  private getTitle(status: number): string {
    const titleMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.GONE]: 'Gone',
      [HttpStatus.PAYMENT_REQUIRED]: 'Payment Required',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };
    return titleMap[status] ?? 'Error';
  }
}
