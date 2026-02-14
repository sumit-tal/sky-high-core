import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SeatService } from './seat.service';
import { SeatMapResponseDto } from './dto';

/**
 * Controller for seat map retrieval.
 * Nested under flights: GET /api/v1/flights/:flightId/seats
 */
@Controller('flights/:flightId/seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  /**
   * Get the seat map for a flight with availability status.
   * GET /api/v1/flights/:flightId/seats
   */
  @Get()
  async getSeatMap(
    @Param('flightId', new ParseUUIDPipe()) flightId: string,
  ): Promise<SeatMapResponseDto> {
    return this.seatService.getSeatMap(flightId);
  }
}
