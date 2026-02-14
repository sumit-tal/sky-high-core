/**
 * Result DTO representing the outcome of a payment attempt.
 */
export class PaymentResultDto {
  readonly success!: boolean;
  readonly transactionId!: string | null;
  readonly status!: string;
  readonly errorMessage!: string | null;
}
