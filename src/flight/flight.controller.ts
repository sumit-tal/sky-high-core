import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { FlightService } from './flight.service';
import { PaginationQueryDto, FlightResponseDto, PaginatedFlightsResponseDto } from './dto';

/**
 * Read-only controller for flight resources.
 */
@Controller('flights')
export class FlightController {
  constructor(private readonly flightService: FlightService) {}

  /**
   * List flights with pagination.
   * GET /api/v1/flights?page=1&limit=10
   */
  @Get()
  async findAll(@Query() query: PaginationQueryDto): Promise<PaginatedFlightsResponseDto> {
    return this.flightService.findAll({ page: query.page, limit: query.limit });
  }

  /**
   * Get a single flight by ID.
   * GET /api/v1/flights/:flightId
   */
  @Get(':flightId')
  async findOne(@Param('flightId', new ParseUUIDPipe()) flightId: string): Promise<FlightResponseDto> {
    return this.flightService.findOne(flightId);
  }
}
