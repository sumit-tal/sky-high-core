import { SeatStatus } from '../../common/types/enums';

/**
 * Response DTO for a single seat in the seat map.
 */
export class SeatResponseDto {
  readonly id!: string;
  readonly row!: number;
  readonly column!: string;
  readonly status!: SeatStatus;
}
