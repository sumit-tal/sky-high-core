import { CheckInStatus } from "../../common/types/enums";

/**
 * Response DTO for a check-in record.
 */
export class CheckInResponseDto {
  readonly id!: string;
  readonly passengerId!: string;
  readonly flightId!: string;
  readonly seatId!: string | null;
  readonly status!: CheckInStatus;
  readonly baggageWeight!: string | null;
  readonly excessFee!: string | null;
  readonly paymentId!: string | null;
  readonly holdExpiresAt!: Date | null;
  readonly confirmedAt!: Date | null;
  readonly message!: string | null;
  readonly createdAt!: Date;
}
