import { IsUUID } from 'class-validator';

/**
 * Request DTO for starting a check-in (seat hold).
 */
export class StartCheckInRequestDto {
  @IsUUID()
  readonly flightId!: string;

  @IsUUID()
  readonly seatId!: string;
}
