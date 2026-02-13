import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { ArgumentsHost } from "@nestjs/common";
import { QueryFailedError, EntityNotFoundError } from "typeorm";
import { HttpExceptionFilter } from "./http-exception.filter";
import { SeatAlreadyHeldException } from "./exceptions/seat-already-held.exception";
import { HoldExpiredException } from "./exceptions/hold-expired.exception";
import { PaymentRequiredException } from "./exceptions/payment-required.exception";
import { FlightNotFoundException } from "./exceptions/flight-not-found.exception";
import { SeatNotFoundException } from "./exceptions/seat-not-found.exception";
import { CheckInNotFoundException } from "./exceptions/checkin-not-found.exception";
import { AlreadyCheckedInException } from "./exceptions/already-checked-in.exception";
import { AlreadyOnWaitlistException } from "./exceptions/already-on-waitlist.exception";
import { CancellationNotAllowedException } from "./exceptions/cancellation-not-allowed.exception";
import { RateLimitExceededException } from "./exceptions/rate-limit-exceeded.exception";
import { ProblemDetails } from "./problem-details.interface";

describe("HttpExceptionFilter", () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;
  let mockResponse: Record<string, unknown>;
  let mockRequest: Record<string, unknown>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest
      .fn()
      .mockReturnValue({ header: mockHeader, json: mockJson });
    mockHeader.mockReturnValue({ json: mockJson });
    mockResponse = { status: mockStatus, header: mockHeader, json: mockJson };
    mockRequest = { url: "/api/v1/check-in" };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  const getResponseBody = (): ProblemDetails =>
    mockJson.mock.calls[0][0] as ProblemDetails;

  describe("When a DomainException is thrown", () => {
    it("Then it should return RFC 7807 with the domain error type for SeatAlreadyHeldException", () => {
      const exception = new SeatAlreadyHeldException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(body.type).toBe("https://skyhigh.com/problems/seat-already-held");
      expect(body.title).toBe("Seat Already Held");
      expect(body.status).toBe(HttpStatus.CONFLICT);
      expect(body.instance).toBe("/api/v1/check-in");
    });

    it("Then it should return RFC 7807 with the domain error type for HoldExpiredException", () => {
      const exception = new HoldExpiredException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.GONE);
      expect(body.type).toBe("https://skyhigh.com/problems/hold-expired");
      expect(body.title).toBe("Hold Expired");
      expect(body.status).toBe(HttpStatus.GONE);
    });

    it("Then it should return RFC 7807 with the domain error type for PaymentRequiredException", () => {
      const exception = new PaymentRequiredException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
      expect(body.type).toBe("https://skyhigh.com/problems/payment-required");
      expect(body.title).toBe("Payment Required");
    });

    it("Then it should return RFC 7807 with the domain error type for FlightNotFoundException", () => {
      const exception = new FlightNotFoundException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(body.type).toBe("https://skyhigh.com/problems/flight-not-found");
      expect(body.title).toBe("Flight Not Found");
    });

    it("Then it should return RFC 7807 with the domain error type for SeatNotFoundException", () => {
      const exception = new SeatNotFoundException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(body.type).toBe("https://skyhigh.com/problems/seat-not-found");
      expect(body.title).toBe("Seat Not Found");
    });

    it("Then it should return RFC 7807 with the domain error type for CheckInNotFoundException", () => {
      const exception = new CheckInNotFoundException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(body.type).toBe("https://skyhigh.com/problems/checkin-not-found");
      expect(body.title).toBe("Check-In Not Found");
    });

    it("Then it should return RFC 7807 with the domain error type for AlreadyCheckedInException", () => {
      const exception = new AlreadyCheckedInException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(body.type).toBe("https://skyhigh.com/problems/already-checked-in");
      expect(body.title).toBe("Already Checked In");
    });

    it("Then it should return RFC 7807 with the domain error type for AlreadyOnWaitlistException", () => {
      const exception = new AlreadyOnWaitlistException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(body.type).toBe(
        "https://skyhigh.com/problems/already-on-waitlist",
      );
      expect(body.title).toBe("Already On Waitlist");
    });

    it("Then it should return RFC 7807 with the domain error type for CancellationNotAllowedException", () => {
      const exception = new CancellationNotAllowedException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(body.type).toBe(
        "https://skyhigh.com/problems/cancellation-not-allowed",
      );
      expect(body.title).toBe("Cancellation Not Allowed");
    });

    it("Then it should return RFC 7807 with the domain error type for RateLimitExceededException", () => {
      const exception = new RateLimitExceededException();
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(body.type).toBe(
        "https://skyhigh.com/problems/rate-limit-exceeded",
      );
      expect(body.title).toBe("Rate Limit Exceeded");
    });

    it("Then it should use a custom detail message when provided", () => {
      const exception = new SeatAlreadyHeldException(
        "Seat 12A is held by passenger P-001",
      );
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(body.detail).toBe("Seat 12A is held by passenger P-001");
    });
  });

  describe("When a standard HttpException is thrown", () => {
    it("Then it should map BadRequestException to RFC 7807", () => {
      const exception = new BadRequestException("Invalid input");
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(body.type).toBe("https://skyhigh.com/problems/bad-request");
      expect(body.title).toBe("Bad Request");
      expect(body.detail).toBe("Invalid input");
    });

    it("Then it should map NotFoundException to RFC 7807", () => {
      const exception = new NotFoundException("Resource not found");
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(body.type).toBe("https://skyhigh.com/problems/not-found");
      expect(body.title).toBe("Not Found");
    });

    it("Then it should map ForbiddenException to RFC 7807", () => {
      const exception = new ForbiddenException("Access denied");
      filter.catch(exception, mockHost);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(getResponseBody().type).toBe(
        "https://skyhigh.com/problems/cancellation-not-allowed",
      );
    });

    it("Then it should map UnauthorizedException to RFC 7807", () => {
      const exception = new UnauthorizedException("Invalid token");
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(body.type).toBe("https://skyhigh.com/problems/unauthorized");
      expect(body.title).toBe("Unauthorized");
    });

    it("Then it should join array messages with semicolons", () => {
      const exception = new BadRequestException([
        "field1 is required",
        "field2 must be a number",
      ]);
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(body.detail).toBe("field1 is required; field2 must be a number");
    });

    it("Then it should fallback to internal-error for unmapped status codes", () => {
      const exception = new HttpException(
        "Service Unavailable",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.type).toBe("https://skyhigh.com/problems/internal-error");
      expect(body.title).toBe("Internal Server Error");
    });
  });

  describe("When a TypeORM error is thrown", () => {
    it("Then it should map QueryFailedError with unique violation (23505) to 409 Conflict", () => {
      const exception = new QueryFailedError(
        "INSERT ...",
        [],
        new Error("duplicate key"),
      );
      (exception as unknown as Record<string, unknown>).driverError = {
        code: "23505",
      };
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(body.type).toBe("https://skyhigh.com/problems/conflict");
      expect(body.detail).toBe(
        "A resource with the given identifier already exists",
      );
    });

    it("Then it should map other QueryFailedError to 500 Internal Server Error", () => {
      const exception = new QueryFailedError(
        "SELECT ...",
        [],
        new Error("connection lost"),
      );
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.type).toBe("https://skyhigh.com/problems/internal-error");
      expect(body.detail).toBe("A database error occurred");
    });

    it("Then it should map EntityNotFoundError to 404 Not Found", () => {
      const exception = new EntityNotFoundError("Seat", { id: "abc" });
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(body.type).toBe("https://skyhigh.com/problems/not-found");
      expect(body.detail).toBe("The requested resource was not found");
    });
  });

  describe("When an unknown error is thrown", () => {
    it("Then it should return a generic 500 error with the error message", () => {
      const exception = new Error("Something broke");
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.type).toBe("https://skyhigh.com/problems/internal-error");
      expect(body.title).toBe("Internal Server Error");
      expect(body.detail).toBe("Something broke");
      expect(body.instance).toBe("/api/v1/check-in");
    });

    it("Then it should return a generic 500 error for non-Error objects", () => {
      filter.catch("string error", mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.detail).toBe("An unexpected error occurred");
    });

    it("Then it should return a generic 500 error for null/undefined", () => {
      filter.catch(null, mockHost);
      const body = getResponseBody();
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.detail).toBe("An unexpected error occurred");
    });
  });

  describe("When any exception is caught", () => {
    it("Then it should set Content-Type to application/problem+json", () => {
      const exception = new BadRequestException("test");
      filter.catch(exception, mockHost);
      expect(mockHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/problem+json",
      );
    });

    it("Then it should include the request URL as instance", () => {
      mockRequest = { url: "/api/v1/flights/FL-001/seats" };
      const exception = new NotFoundException("Not found");
      filter.catch(exception, mockHost);
      const body = getResponseBody();
      expect(body.instance).toBe("/api/v1/flights/FL-001/seats");
    });
  });
});
