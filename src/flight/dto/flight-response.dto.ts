import { FlightStatus } from '../../common/types/enums';
import { AircraftTypeResponseDto } from './aircraft-type-response.dto';

/**
 * Response DTO for a single flight.
 */
export class FlightResponseDto {
  readonly id!: string;
  readonly flightNumber!: string;
  readonly departureTime!: Date;
  readonly status!: FlightStatus;
  readonly aircraftType!: AircraftTypeResponseDto;
}
