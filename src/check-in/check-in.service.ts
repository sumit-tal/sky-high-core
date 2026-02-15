import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource, Repository } from "typeorm";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { AuditService } from "../audit/audit.service";
import {
  CheckInResponseDto,
  CheckInCancelledResponseDto,
  StartCheckInRequestDto,
  UpdateCheckInRequestDto,
} from "./dto";
import { RedisService, RedisKey, REDIS_TTL } from "../common/redis";
import { MetricsService, withSpan } from "../common/observability";
import { SeatService } from "../seat/seat.service";
import { BaggageService } from "../baggage/baggage.service";
import { PaymentService } from "../payment/payment.service";
import {
  SeatStatus,
  CheckInStatus,
  FlightStatus,
  AuditAction,
} from "../common/types/enums";
import {
  FlightNotFoundException,
  SeatNotFoundException,
  SeatAlreadyHeldException,
  AlreadyCheckedInException,
  CheckInNotFoundException,
  HoldExpiredException,
  CancellationNotAllowedException,
} from "../common/filters/exceptions";

const LOCK_TTL_MS = REDIS_TTL.SEAT_LOCK * 1000;
const HOLD_TTL_SECONDS = REDIS_TTL.SEAT_HOLD;

export const WAITLIST_PROCESS_EVENT = "waitlist.process";

/**
 * Service for check-in initiation (seat hold).
 * Implements the seat hold flow from Technical PRD §6.1:
 * 1. Acquire Redlock on lock:seat:{seatId}
 * 2. Validate flight, seat, and existing check-in
 * 3. CAS update seat → HELD within a transaction
 * 4. Set Redis hold key with 120s TTL
 * 5. Invalidate seat map cache
 */
@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    @InjectRepository(CheckIn)
    private readonly checkInRepository: Repository<CheckIn>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly seatService: SeatService,
    private readonly baggageService: BaggageService,
    private readonly paymentService: PaymentService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Start check-in by holding a seat for the passenger.
   * @throws FlightNotFoundException if the flight does not exist.
   * @throws SeatNotFoundException if the seat does not exist or doesn't belong to the flight.
   * @throws AlreadyCheckedInException if the passenger already has an active check-in for this flight.
   * @throws SeatAlreadyHeldException if the seat is not AVAILABLE.
   */
  async startCheckIn({
    passengerId,
    dto,
  }: {
    passengerId: string;
    dto: StartCheckInRequestDto;
  }): Promise<CheckInResponseDto> {
    const { flightId, seatId } = dto;
    const startTime = Date.now();
    await this.validateFlightExists(flightId);
    await this.validateSeatBelongsToFlight(seatId, flightId);
    await this.validateNoActiveCheckIn(passengerId, flightId);
    try {
      const result = await withSpan(
        "check-in.seat-hold",
        { flightId, seatId, passengerId },
        async () => {
          const lockKey = RedisKey.seatLock(seatId);
          const lock = await this.redisService.acquireLock(
            lockKey,
            LOCK_TTL_MS,
          );
          try {
            return await this.holdSeatWithinLock({
              passengerId,
              flightId,
              seatId,
            });
          } finally {
            await this.redisService.releaseLock(lock);
          }
        },
      );
      const durationSec = (Date.now() - startTime) / 1000;
      this.metricsService.checkinDurationSeconds
        .labels({ flight_id: flightId, status: "started" })
        .observe(durationSec);
      return result;
    } catch (error) {
      if (error instanceof SeatAlreadyHeldException) {
        this.metricsService.seatContentionTotal
          .labels({ flight_id: flightId })
          .inc();
      }
      throw error;
    }
  }

  private async validateFlightExists(flightId: string): Promise<void> {
    const flight = await this.flightRepository.findOne({
      where: { id: flightId },
    });
    if (!flight) {
      throw new FlightNotFoundException(
        `Flight with id '${flightId}' was not found`,
      );
    }
  }

  private async validateSeatBelongsToFlight(
    seatId: string,
    flightId: string,
  ): Promise<void> {
    const seat = await this.seatRepository.findOne({
      where: { id: seatId, flightId },
    });
    if (!seat) {
      throw new SeatNotFoundException(
        `Seat with id '${seatId}' was not found on flight '${flightId}'`,
      );
    }
  }

  private async validateNoActiveCheckIn(
    passengerId: string,
    flightId: string,
  ): Promise<void> {
    const existing = await this.checkInRepository.findOne({
      where: { passengerId, flightId },
    });
    if (existing && existing.status !== CheckInStatus.CANCELLED) {
      throw new AlreadyCheckedInException(
        `Passenger '${passengerId}' already has an active check-in for flight '${flightId}'`,
      );
    }
  }

  private async holdSeatWithinLock({
    passengerId,
    flightId,
    seatId,
  }: {
    passengerId: string;
    flightId: string;
    seatId: string;
  }): Promise<CheckInResponseDto> {
    const seat = await this.seatRepository.findOne({ where: { id: seatId } });
    if (!seat || seat.status !== SeatStatus.AVAILABLE) {
      throw new SeatAlreadyHeldException(
        `Seat with id '${seatId}' is not available`,
      );
    }
    const heldAt = new Date();
    const holdExpiresAt = new Date(heldAt.getTime() + HOLD_TTL_SECONDS * 1000);
    const checkIn = await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager.update(
        Seat,
        { id: seatId, status: SeatStatus.AVAILABLE },
        { status: SeatStatus.HELD, heldBy: passengerId, heldAt },
      );
      if (updateResult.affected === 0) {
        throw new SeatAlreadyHeldException(
          `Seat with id '${seatId}' is no longer available`,
        );
      }
      const checkInRecord = manager.create(CheckIn, {
        passengerId,
        flightId,
        seatId,
        status: CheckInStatus.IN_PROGRESS,
      });
      const savedCheckIn = await manager.save(CheckIn, checkInRecord);
      await this.auditService.logWithTransaction({
        manager,
        dto: {
          entityType: "seat",
          entityId: seatId,
          action: AuditAction.SEAT_HELD,
          fromState: SeatStatus.AVAILABLE,
          toState: SeatStatus.HELD,
          actorId: passengerId,
          metadata: { flightId, checkInId: savedCheckIn.id },
        },
      });
      return savedCheckIn;
    });
    const holdKey = RedisKey.seatHold(seatId);
    await this.redisService.setSeatHold(holdKey, passengerId);
    await this.seatService.invalidateCache(flightId);
    this.logger.log(
      `Seat '${seatId}' held by passenger '${passengerId}' on flight '${flightId}', expires at ${holdExpiresAt.toISOString()}`,
    );
    return this.toCheckInResponse({ checkIn, holdExpiresAt });
  }

  /**
   * Get check-in status by ID.
   * @throws CheckInNotFoundException if the check-in does not exist.
   */
  async getCheckIn({
    checkInId,
    passengerId,
  }: {
    checkInId: string;
    passengerId: string;
  }): Promise<CheckInResponseDto> {
    const checkIn = await this.findCheckInOrThrow(checkInId, passengerId);
    const holdExpiresAt = this.calculateHoldExpiresAt(checkIn);
    return this.toCheckInResponse({ checkIn, holdExpiresAt });
  }

  /**
   * Confirm check-in with optional baggage weight.
   * @throws CheckInNotFoundException if the check-in does not exist.
   * @throws HoldExpiredException if the seat hold has expired.
   */
  async confirmCheckIn({
    checkInId,
    passengerId,
    dto,
  }: {
    checkInId: string;
    passengerId: string;
    dto: UpdateCheckInRequestDto;
  }): Promise<CheckInResponseDto> {
    const checkIn = await this.findCheckInOrThrow(checkInId, passengerId);
    await this.validateHoldNotExpired(checkIn);
    const baggageWeight = dto.baggageWeight ?? 0;
    const baggageResult = await this.baggageService.validateAndCalculateFee({
      passengerId,
      declaredWeight: baggageWeight,
    });
    if (baggageResult.isOverweight) {
      return this.handleExcessBaggage({
        checkIn,
        baggageWeight,
        excessFee: baggageResult.excessFee,
      });
    }
    return this.completeCheckIn({ checkIn, baggageWeight, paymentId: null });
  }

  /**
   * Cancel check-in and release the seat.
   * @throws CheckInNotFoundException if the check-in does not exist.
   * @throws CancellationNotAllowedException if the flight has departed.
   */
  async cancelCheckIn({
    checkInId,
    passengerId,
  }: {
    checkInId: string;
    passengerId: string;
  }): Promise<CheckInCancelledResponseDto> {
    const checkIn = await this.findCheckInOrThrow(checkInId, passengerId);
    const flight = await this.flightRepository.findOne({
      where: { id: checkIn.flightId },
    });
    if (flight?.status === FlightStatus.DEPARTED) {
      throw new CancellationNotAllowedException(
        "Cannot cancel check-in after the flight has departed.",
      );
    }
    const cancelledAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      if (checkIn.seatId) {
        await manager.update(
          Seat,
          { id: checkIn.seatId },
          { status: SeatStatus.AVAILABLE, heldBy: null, heldAt: null },
        );
        await this.auditService.logWithTransaction({
          manager,
          dto: {
            entityType: "seat",
            entityId: checkIn.seatId,
            action: AuditAction.SEAT_CANCELLED,
            fromState:
              checkIn.status === CheckInStatus.COMPLETED
                ? SeatStatus.CONFIRMED
                : SeatStatus.HELD,
            toState: SeatStatus.AVAILABLE,
            actorId: passengerId,
            metadata: { flightId: checkIn.flightId, checkInId },
          },
        });
      }
      await manager.update(
        CheckIn,
        { id: checkInId },
        { status: CheckInStatus.CANCELLED },
      );
      await this.auditService.logWithTransaction({
        manager,
        dto: {
          entityType: "check_in",
          entityId: checkInId,
          action: AuditAction.CHECKIN_CANCELLED,
          fromState: checkIn.status,
          toState: CheckInStatus.CANCELLED,
          actorId: passengerId,
          metadata: { flightId: checkIn.flightId },
        },
      });
    });
    if (checkIn.seatId) {
      const holdKey = RedisKey.seatHold(checkIn.seatId);
      await this.redisService.del(holdKey);
      await this.seatService.invalidateCache(checkIn.flightId);
    }
    this.eventEmitter.emit(WAITLIST_PROCESS_EVENT, {
      flightId: checkIn.flightId,
    });
    this.logger.log(
      `Check-in '${checkInId}' cancelled for passenger '${passengerId}' on flight '${checkIn.flightId}'`,
    );
    return { id: checkInId, status: "CANCELLED" as const, cancelledAt };
  }

  private async findCheckInOrThrow(
    checkInId: string,
    passengerId: string,
  ): Promise<CheckIn> {
    const checkIn = await this.checkInRepository.findOne({
      where: { id: checkInId, passengerId },
    });
    if (!checkIn) {
      throw new CheckInNotFoundException(
        `No check-in record found with id '${checkInId}'`,
      );
    }
    return checkIn;
  }

  private async validateHoldNotExpired(checkIn: CheckIn): Promise<void> {
    if (
      checkIn.status !== CheckInStatus.IN_PROGRESS &&
      checkIn.status !== CheckInStatus.AWAITING_PAYMENT
    ) {
      throw new HoldExpiredException(
        "The seat hold has expired. Please select a new seat.",
      );
    }
    if (checkIn.seatId) {
      const holdKey = RedisKey.seatHold(checkIn.seatId);
      const holdExists = await this.redisService.exists(holdKey);
      if (!holdExists) {
        throw new HoldExpiredException(
          "The seat hold has expired. Please select a new seat.",
        );
      }
    }
  }

  private async handleExcessBaggage({
    checkIn,
    baggageWeight,
    excessFee,
  }: {
    checkIn: CheckIn;
    baggageWeight: number;
    excessFee: number;
  }): Promise<CheckInResponseDto> {
    await this.checkInRepository.update(
      { id: checkIn.id },
      {
        status: CheckInStatus.AWAITING_PAYMENT,
        baggageWeight: String(baggageWeight),
        excessFee: String(excessFee),
      },
    );
    const paymentResult = await this.paymentService.processPayment({
      checkInId: checkIn.id,
      passengerId: checkIn.passengerId,
      amount: excessFee,
      currency: "USD",
    });
    if (paymentResult.success) {
      return this.completeCheckIn({
        checkIn: {
          ...checkIn,
          baggageWeight: String(baggageWeight),
          excessFee: String(excessFee),
        },
        baggageWeight,
        paymentId: paymentResult.transactionId,
      });
    }
    const updatedCheckIn = await this.checkInRepository.findOneOrFail({
      where: { id: checkIn.id },
    });
    const holdExpiresAt = this.calculateHoldExpiresAt(updatedCheckIn);
    return this.toCheckInResponse({
      checkIn: updatedCheckIn,
      holdExpiresAt,
      message: `Excess baggage fee of ${excessFee.toFixed(2)} must be paid to complete check-in.`,
    });
  }

  private async completeCheckIn({
    checkIn,
    baggageWeight,
    paymentId,
  }: {
    checkIn: CheckIn;
    baggageWeight: number;
    paymentId: string | null;
  }): Promise<CheckInResponseDto> {
    const confirmedAt = new Date();
    const seatId = checkIn.seatId;
    await this.dataSource.transaction(async (manager) => {
      if (seatId) {
        await manager.update(
          Seat,
          { id: seatId },
          { status: SeatStatus.CONFIRMED },
        );
        await this.auditService.logWithTransaction({
          manager,
          dto: {
            entityType: "seat",
            entityId: seatId,
            action: AuditAction.SEAT_CONFIRMED,
            fromState: SeatStatus.HELD,
            toState: SeatStatus.CONFIRMED,
            actorId: checkIn.passengerId,
            metadata: { flightId: checkIn.flightId, checkInId: checkIn.id },
          },
        });
      }
      await manager.update(
        CheckIn,
        { id: checkIn.id },
        {
          status: CheckInStatus.COMPLETED,
          baggageWeight: String(baggageWeight),
          paymentId,
        },
      );
      await this.auditService.logWithTransaction({
        manager,
        dto: {
          entityType: "check_in",
          entityId: checkIn.id,
          action: AuditAction.CHECKIN_COMPLETED,
          fromState: checkIn.status,
          toState: CheckInStatus.COMPLETED,
          actorId: checkIn.passengerId,
          metadata: { flightId: checkIn.flightId, paymentId },
        },
      });
    });
    if (seatId) {
      const holdKey = RedisKey.seatHold(seatId);
      await this.redisService.del(holdKey);
      await this.seatService.invalidateCache(checkIn.flightId);
    }
    this.logger.log(
      `Check-in '${checkIn.id}' completed for passenger '${checkIn.passengerId}' on flight '${checkIn.flightId}'`,
    );
    const completedCheckIn = await this.checkInRepository.findOneOrFail({
      where: { id: checkIn.id },
    });
    const holdDurationSec =
      (confirmedAt.getTime() - checkIn.createdAt.getTime()) / 1000;
    this.metricsService.seatHoldDurationSeconds
      .labels({ flight_id: checkIn.flightId })
      .observe(holdDurationSec);
    this.metricsService.checkinDurationSeconds
      .labels({ flight_id: checkIn.flightId, status: "completed" })
      .observe(holdDurationSec);
    return this.toCheckInResponse({
      checkIn: completedCheckIn,
      holdExpiresAt: null,
      confirmedAt,
    });
  }

  private calculateHoldExpiresAt(checkIn: CheckIn): Date | null {
    if (
      checkIn.status !== CheckInStatus.IN_PROGRESS &&
      checkIn.status !== CheckInStatus.AWAITING_PAYMENT
    ) {
      return null;
    }
    return new Date(checkIn.createdAt.getTime() + HOLD_TTL_SECONDS * 1000);
  }

  private toCheckInResponse({
    checkIn,
    holdExpiresAt = null,
    confirmedAt = null,
    message = null,
  }: {
    checkIn: CheckIn;
    holdExpiresAt?: Date | null;
    confirmedAt?: Date | null;
    message?: string | null;
  }): CheckInResponseDto {
    return {
      id: checkIn.id,
      passengerId: checkIn.passengerId,
      flightId: checkIn.flightId,
      seatId: checkIn.seatId,
      status: checkIn.status,
      baggageWeight: checkIn.baggageWeight,
      excessFee: checkIn.excessFee,
      paymentId: checkIn.paymentId,
      holdExpiresAt,
      confirmedAt,
      message,
      createdAt: checkIn.createdAt,
    };
  }
}
