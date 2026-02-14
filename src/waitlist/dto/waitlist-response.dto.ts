import { WaitlistStatus } from '../../common/types/enums';

/**
 * Response DTO for a waitlist entry.
 */
export class WaitlistResponseDto {
  readonly id!: string;
  readonly flightId!: string;
  readonly passengerId!: string;
  readonly position!: number;
  readonly status!: WaitlistStatus;
  readonly createdAt!: Date;
}
