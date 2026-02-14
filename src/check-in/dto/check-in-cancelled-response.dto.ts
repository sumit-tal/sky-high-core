/**
 * Response DTO for a cancelled check-in.
 */
export class CheckInCancelledResponseDto {
  readonly id!: string;
  readonly status!: 'CANCELLED';
  readonly cancelledAt!: Date;
}
