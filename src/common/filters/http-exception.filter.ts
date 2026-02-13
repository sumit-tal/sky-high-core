import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { QueryFailedError, EntityNotFoundError } from "typeorm";
import { ProblemDetails } from "./problem-details.interface";
import { DomainException } from "./domain.exception";
import {
  ErrorType,
  INTERNAL_ERROR,
  STATUS_ERROR_TYPE_MAP,
} from "./error-types.constants";

/**
 * Global exception filter that formats all error responses
 * according to the RFC 7807 Problem Details specification.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { errorType, detail } = this.resolveException(exception);
    const problemDetails: ProblemDetails = {
      type: errorType.type,
      title: errorType.title,
      status: errorType.status,
      detail,
      instance: request.url,
    };
    if (errorType.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${errorType.status}] ${detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    response
      .status(errorType.status)
      .header("Content-Type", "application/problem+json")
      .json(problemDetails);
  }

  private resolveException(exception: unknown): {
    errorType: ErrorType;
    detail: string;
  } {
    if (exception instanceof DomainException) {
      return { errorType: exception.errorType, detail: exception.message };
    }
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }
    if (exception instanceof QueryFailedError) {
      return this.resolveQueryFailedError(exception);
    }
    if (exception instanceof EntityNotFoundError) {
      return {
        errorType: STATUS_ERROR_TYPE_MAP[HttpStatus.NOT_FOUND]!,
        detail: "The requested resource was not found",
      };
    }
    return {
      errorType: INTERNAL_ERROR,
      detail:
        exception instanceof Error
          ? exception.message
          : "An unexpected error occurred",
    };
  }

  private resolveHttpException(exception: HttpException): {
    errorType: ErrorType;
    detail: string;
  } {
    const status = exception.getStatus();
    const errorType = STATUS_ERROR_TYPE_MAP[status] ?? INTERNAL_ERROR;
    const exceptionResponse = exception.getResponse();
    const rawDetail =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : ((exceptionResponse as Record<string, unknown>)["message"] ??
          exception.message);
    const detail = Array.isArray(rawDetail)
      ? rawDetail.join("; ")
      : String(rawDetail);
    return { errorType, detail };
  }

  private resolveQueryFailedError(exception: QueryFailedError): {
    errorType: ErrorType;
    detail: string;
  } {
    const driverError = exception.driverError as unknown as
      | Record<string, unknown>
      | undefined;
    const code = driverError?.["code"] as string | undefined;
    if (code === "23505") {
      return {
        errorType: STATUS_ERROR_TYPE_MAP[HttpStatus.CONFLICT]!,
        detail: "A resource with the given identifier already exists",
      };
    }
    return {
      errorType: INTERNAL_ERROR,
      detail: "A database error occurred",
    };
  }
}
