/**
 * Request DTO for processing a payment via the external Payment Service.
 */
export class PaymentRequestDto {
  readonly passengerId!: string;
  readonly amount!: number;
  readonly currency!: string;
  readonly checkInId!: string;
}
