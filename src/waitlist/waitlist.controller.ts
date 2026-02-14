import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistResponseDto } from './dto';
import { CurrentUser } from '../common/decorators';

/**
 * Controller for waitlist operations.
 * POST   /api/v1/flights/:flightId/waitlist — Join waitlist
 * GET    /api/v1/flights/:flightId/waitlist — Get waitlist status
 * DELETE /api/v1/waitlist/:id               — Leave waitlist
 */
@Controller()
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  /**
   * Join the waitlist for a flight.
   * POST /api/v1/flights/:flightId/waitlist
   */
  @Post('flights/:flightId/waitlist')
  @HttpCode(HttpStatus.CREATED)
  async joinWaitlist(
    @CurrentUser() passengerId: string,
    @Param('flightId', ParseUUIDPipe) flightId: string,
  ): Promise<WaitlistResponseDto> {
    return this.waitlistService.joinWaitlist({ passengerId, flightId });
  }

  /**
   * Get waitlist entries for a flight.
   * GET /api/v1/flights/:flightId/waitlist
   */
  @Get('flights/:flightId/waitlist')
  @HttpCode(HttpStatus.OK)
  async getFlightWaitlist(
    @Param('flightId', ParseUUIDPipe) flightId: string,
  ): Promise<WaitlistResponseDto[]> {
    return this.waitlistService.getFlightWaitlist({ flightId });
  }

  /**
   * Leave the waitlist.
   * DELETE /api/v1/waitlist/:id
   */
  @Delete('waitlist/:id')
  @HttpCode(HttpStatus.OK)
  async leaveWaitlist(
    @CurrentUser() passengerId: string,
    @Param('id', ParseUUIDPipe) waitlistId: string,
  ): Promise<WaitlistResponseDto> {
    return this.waitlistService.leaveWaitlist({ waitlistId, passengerId });
  }
}
