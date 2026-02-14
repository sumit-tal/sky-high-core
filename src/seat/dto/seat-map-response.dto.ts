import { SeatResponseDto } from './seat-response.dto';

/**
 * Response DTO for the full seat map of a flight.
 */
export class SeatMapResponseDto {
  readonly flightId!: string;
  readonly aircraft!: string;
  readonly seats!: SeatResponseDto[];
}
