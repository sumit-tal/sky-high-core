import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CheckInService } from "./check-in.service";
import {
  StartCheckInRequestDto,
  UpdateCheckInRequestDto,
  CheckInResponseDto,
  CheckInCancelledResponseDto,
} from "./dto";
import { CurrentUser } from "../common/decorators";

/**
 * Controller for check-in operations.
 * POST   /api/v1/check-ins        — Start check-in (hold seat)
 * GET    /api/v1/check-ins/:id    — Get check-in status
 * PATCH  /api/v1/check-ins/:id    — Confirm check-in
 * DELETE /api/v1/check-ins/:id    — Cancel check-in
 */
@Controller("check-ins")
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

  /**
   * Get check-in status by ID.
   * GET /api/v1/check-ins/:id
   */
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getCheckIn(
    @CurrentUser() passengerId: string,
    @Param("id", ParseUUIDPipe) checkInId: string,
  ): Promise<CheckInResponseDto> {
    return this.checkInService.getCheckIn({ checkInId, passengerId });
  }

  /**
   * Confirm check-in with optional baggage weight.
   * PATCH /api/v1/check-ins/:id
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async confirmCheckIn(
    @CurrentUser() passengerId: string,
    @Param("id", ParseUUIDPipe) checkInId: string,
    @Body() dto: UpdateCheckInRequestDto,
  ): Promise<CheckInResponseDto> {
    return this.checkInService.confirmCheckIn({ checkInId, passengerId, dto });
  }

  /**
   * Cancel check-in and release the seat.
   * DELETE /api/v1/check-ins/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async cancelCheckIn(
    @CurrentUser() passengerId: string,
    @Param("id", ParseUUIDPipe) checkInId: string,
  ): Promise<CheckInCancelledResponseDto> {
    return this.checkInService.cancelCheckIn({ checkInId, passengerId });
  }
}
