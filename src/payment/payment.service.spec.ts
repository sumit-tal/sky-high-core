import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { of, throwError } from "rxjs";
import { PaymentService } from "./payment.service";
import { AuditLog } from "../audit/audit-log.entity";
import { AuditAction } from "../common/types/enums";

const PASSENGER_ID = "passenger-uuid-1";
const CHECKIN_ID = "checkin-uuid-1";
const PAYMENT_SERVICE_URL = "http://stub-payment:3001";

const configMap: Record<string, string> = {
  PAYMENT_SERVICE_URL: PAYMENT_SERVICE_URL,
  PAYMENT_TIMEOUT_MS: "5000",
  PAYMENT_MAX_RETRIES: "2",
  PAYMENT_INITIAL_BACKOFF_MS: "10",
};

describe("PaymentService", () => {
  let service: PaymentService;
  let httpService: jest.Mocked<HttpService>;
  let auditLogRepository: jest.Mocked<Repository<AuditLog>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, defaultValue: string) =>
                configMap[key] ?? defaultValue,
            ),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();
    service = module.get<PaymentService>(PaymentService);
    httpService = module.get(HttpService);
    auditLogRepository = module.get(getRepositoryToken(AuditLog));
  });

  describe("processPayment", () => {
    it("When payment succeeds on first attempt, Then returns success with transactionId", async () => {
      httpService.post.mockReturnValue(
        of({
          data: { transactionId: "txn_123", status: "confirmed" },
          status: 201,
        } as any),
      );
      const result = await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("txn_123");
      expect(result.status).toBe("confirmed");
      expect(result.errorMessage).toBeNull();
    });

    it("When payment succeeds, Then creates PAYMENT_REQUESTED and PAYMENT_CONFIRMED audit logs", async () => {
      httpService.post.mockReturnValue(
        of({
          data: { transactionId: "txn_123", status: "confirmed" },
          status: 201,
        } as any),
      );
      await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "payment",
          entityId: CHECKIN_ID,
          action: AuditAction.PAYMENT_REQUESTED,
          actorId: PASSENGER_ID,
        }),
      );
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "payment",
          entityId: CHECKIN_ID,
          action: AuditAction.PAYMENT_CONFIRMED,
          actorId: PASSENGER_ID,
        }),
      );
      expect(auditLogRepository.save).toHaveBeenCalledTimes(2);
    });

    it("When payment fails all retries, Then returns failure without throwing", async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error("Connection refused")),
      );
      const result = await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(result.success).toBe(false);
      expect(result.transactionId).toBeNull();
      expect(result.status).toBe("failed");
      expect(result.errorMessage).toContain("Connection refused");
    });

    it("When payment fails all retries, Then only creates PAYMENT_REQUESTED audit log", async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error("Timeout")),
      );
      await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PAYMENT_REQUESTED,
        }),
      );
      expect(auditLogRepository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PAYMENT_CONFIRMED,
        }),
      );
    });

    it("When payment fails then succeeds on retry, Then returns success", async () => {
      httpService.post
        .mockReturnValueOnce(
          throwError(() => new Error("Connection refused")),
        )
        .mockReturnValueOnce(
          of({
            data: { transactionId: "txn_456", status: "confirmed" },
            status: 201,
          } as any),
        );
      const result = await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("txn_456");
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it("When payment returns non-confirmed status, Then returns failure", async () => {
      httpService.post.mockReturnValue(
        of({
          data: { transactionId: "txn_789", status: "pending" },
          status: 201,
        } as any),
      );
      const result = await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(result.success).toBe(false);
      expect(result.transactionId).toBeNull();
      expect(result.status).toBe("pending");
      expect(result.errorMessage).toContain("non-confirmed");
    });

    it("When payment succeeds, Then calls payment service with correct payload", async () => {
      httpService.post.mockReturnValue(
        of({
          data: { transactionId: "txn_123", status: "confirmed" },
          status: 201,
        } as any),
      );
      await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 35,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(httpService.post).toHaveBeenCalledWith(
        `${PAYMENT_SERVICE_URL}/api/v1/payments`,
        {
          passengerId: PASSENGER_ID,
          amount: 35,
          currency: "USD",
          checkInId: CHECKIN_ID,
        },
      );
    });

    it("When payment retries exhausted, Then total attempts equals maxRetries + 1", async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error("Timeout")),
      );
      await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 50,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      // maxRetries=2, so total attempts = 3 (initial + 2 retries)
      expect(httpService.post).toHaveBeenCalledTimes(3);
    });

    it("When payment amount is zero, Then still processes payment", async () => {
      httpService.post.mockReturnValue(
        of({
          data: { transactionId: "txn_000", status: "confirmed" },
          status: 201,
        } as any),
      );
      const result = await service.processPayment({
        passengerId: PASSENGER_ID,
        amount: 0,
        currency: "USD",
        checkInId: CHECKIN_ID,
      });
      expect(result.success).toBe(true);
    });
  });
});
