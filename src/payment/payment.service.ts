import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { timeout } from "rxjs/operators";
import { AxiosResponse } from "axios";
import { AuditService } from "../audit/audit.service";
import { MetricsService, withSpan } from "../common/observability";
import { AuditAction } from "../common/types/enums";
import { PaymentRequestDto, PaymentResultDto } from "./dto";

const DEFAULT_HTTP_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 500;
const BACKOFF_MULTIPLIER = 2;

interface PaymentServiceResponse {
  readonly transactionId: string;
  readonly status: string;
}

/**
 * Service for processing payments via the external Payment Service stub.
 * Implements synchronous HTTP calls with configurable timeout
 * and exponential backoff retry. Payment failures are handled
 * gracefully (returns failure result, does not throw).
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paymentServiceUrl: string;
  private readonly httpTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
  ) {
    this.paymentServiceUrl = this.configService.get<string>(
      "PAYMENT_SERVICE_URL",
      "http://localhost:3001",
    );
    this.httpTimeoutMs = Number(
      this.configService.get<string>(
        "PAYMENT_TIMEOUT_MS",
        String(DEFAULT_HTTP_TIMEOUT_MS),
      ),
    );
    this.maxRetries = Number(
      this.configService.get<string>(
        "PAYMENT_MAX_RETRIES",
        String(DEFAULT_MAX_RETRIES),
      ),
    );
    this.initialBackoffMs = Number(
      this.configService.get<string>(
        "PAYMENT_INITIAL_BACKOFF_MS",
        String(DEFAULT_INITIAL_BACKOFF_MS),
      ),
    );
  }

  /**
   * Process a payment with timeout and exponential backoff retry.
   * Creates PAYMENT_REQUESTED and PAYMENT_CONFIRMED audit log entries.
   * Returns a result object — never throws on payment failure.
   */
  async processPayment({
    passengerId,
    amount,
    currency,
    checkInId,
  }: PaymentRequestDto): Promise<PaymentResultDto> {
    this.auditService.log({
      entityType: "payment",
      entityId: checkInId,
      action: AuditAction.PAYMENT_REQUESTED,
      fromState: null,
      toState: "requested",
      actorId: passengerId,
      metadata: { amount, currency },
    });
    this.logger.log(
      `Payment requested for check-in '${checkInId}': amount=${amount} ${currency}`,
    );
    const startTime = Date.now();
    const result = await withSpan(
      "payment.process",
      { checkInId, passengerId, amount, currency },
      async () =>
        this.callPaymentServiceWithRetry({
          passengerId,
          amount,
          currency,
          checkInId,
        }),
    );
    const durationSec = (Date.now() - startTime) / 1000;
    this.metricsService.paymentRequestDurationSeconds
      .labels({ status: result.status })
      .observe(durationSec);
    if (result.success) {
      this.auditService.log({
        entityType: "payment",
        entityId: checkInId,
        action: AuditAction.PAYMENT_CONFIRMED,
        fromState: "requested",
        toState: "confirmed",
        actorId: passengerId,
        metadata: {
          amount,
          currency,
          transactionId: result.transactionId,
        },
      });
      this.logger.log(
        `Payment confirmed for check-in '${checkInId}': txn=${result.transactionId}`,
      );
    }
    return result;
  }

  private async callPaymentServiceWithRetry({
    passengerId,
    amount,
    currency,
    checkInId,
  }: PaymentRequestDto): Promise<PaymentResultDto> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs =
          this.initialBackoffMs * Math.pow(BACKOFF_MULTIPLIER, attempt - 1);
        this.logger.warn(
          `Payment retry ${attempt}/${this.maxRetries} for check-in '${checkInId}' after ${backoffMs}ms`,
        );
        await this.delay(backoffMs);
      }
      try {
        const response: AxiosResponse<PaymentServiceResponse> =
          await firstValueFrom(
            this.httpService
              .post<PaymentServiceResponse>(
                `${this.paymentServiceUrl}/api/v1/payments`,
                { passengerId, amount, currency, checkInId },
              )
              .pipe(timeout(this.httpTimeoutMs)),
          );
        const { transactionId, status } = response.data;
        if (status === "confirmed") {
          return {
            success: true,
            transactionId,
            status,
            errorMessage: null,
          };
        }
        return {
          success: false,
          transactionId: null,
          status,
          errorMessage: `Payment returned non-confirmed status: ${status}`,
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Payment attempt ${attempt + 1} failed for check-in '${checkInId}': ${lastError.message}`,
        );
      }
    }
    this.logger.error(
      `Payment failed after ${this.maxRetries + 1} attempts for check-in '${checkInId}': ${lastError?.message}`,
    );
    return {
      success: false,
      transactionId: null,
      status: "failed",
      errorMessage: lastError?.message ?? "Payment failed after all retries",
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
