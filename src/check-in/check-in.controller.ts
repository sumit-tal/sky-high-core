import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CheckInService } from './check-in.service';
import { StartCheckInRequestDto, CheckInResponseDto } from './dto';
import { CurrentUser } from '../common/decorators';

/**
 * Controller for check-in operations.
 * POST /api/v1/check-ins — Start check-in (hold seat)
 */
@Controller('check-ins')
export class CheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  /**
   * Start check-in by selecting and holding a seat.
   * POST /api/v1/check-ins
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async startCheckIn(
    @CurrentUser() passengerId: string,
    @Body() dto: StartCheckInRequestDto,
  ): Promise<CheckInResponseDto> {
    return this.checkInService.startCheckIn({ passengerId, dto });
  }
}
