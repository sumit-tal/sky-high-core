import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource, Repository } from "typeorm";
import { firstValueFrom } from "rxjs";
import { timeout, retry } from "rxjs/operators";
import { AxiosResponse } from "axios";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { AuditLog } from "../audit/audit-log.entity";
import {
  CheckInResponseDto,
  CheckInCancelledResponseDto,
  StartCheckInRequestDto,
  UpdateCheckInRequestDto,
} from "./dto";
import { RedisService, RedisKey, REDIS_TTL } from "../common/redis";
import { SeatService } from "../seat/seat.service";
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
const DEFAULT_MAX_BAGGAGE_KG = 25;
const DEFAULT_EXCESS_FEE_PER_KG = 10;
const HTTP_TIMEOUT_MS = 5000;
const HTTP_RETRY_COUNT = 2;

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

  private readonly maxBaggageKg: number;
  private readonly excessFeePerKg: number;
  private readonly weightServiceUrl: string;
  private readonly paymentServiceUrl: string;

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
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.maxBaggageKg = Number(
      this.configService.get<string>(
        "MAX_BAGGAGE_WEIGHT_KG",
        String(DEFAULT_MAX_BAGGAGE_KG),
      ),
    );
    this.excessFeePerKg = Number(
      this.configService.get<string>(
        "EXCESS_FEE_PER_KG",
        String(DEFAULT_EXCESS_FEE_PER_KG),
      ),
    );
    this.weightServiceUrl = this.configService.get<string>(
      "WEIGHT_SERVICE_URL",
      "http://localhost:3002",
    );
    this.paymentServiceUrl = this.configService.get<string>(
      "PAYMENT_SERVICE_URL",
      "http://localhost:3001",
    );
  }

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
    await this.validateFlightExists(flightId);
    await this.validateSeatBelongsToFlight(seatId, flightId);
    await this.validateNoActiveCheckIn(passengerId, flightId);
    const lockKey = RedisKey.seatLock(seatId);
    const lock = await this.redisService.acquireLock(lockKey, LOCK_TTL_MS);
    try {
      return await this.holdSeatWithinLock({ passengerId, flightId, seatId });
    } finally {
      await this.redisService.releaseLock(lock);
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
      const auditLog = manager.create(AuditLog, {
        entityType: "seat",
        entityId: seatId,
        action: AuditAction.SEAT_HELD,
        fromState: SeatStatus.AVAILABLE,
        toState: SeatStatus.HELD,
        actorId: passengerId,
        metadata: { flightId, checkInId: savedCheckIn.id },
      });
      await manager.save(AuditLog, auditLog);
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
    await this.validateBaggageWeight(passengerId, baggageWeight);
    if (baggageWeight > this.maxBaggageKg) {
      return this.handleExcessBaggage({ checkIn, baggageWeight });
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
        const seatAudit = manager.create(AuditLog, {
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
        });
        await manager.save(AuditLog, seatAudit);
      }
      await manager.update(
        CheckIn,
        { id: checkInId },
        { status: CheckInStatus.CANCELLED },
      );
      const checkInAudit = manager.create(AuditLog, {
        entityType: "check_in",
        entityId: checkInId,
        action: AuditAction.CHECKIN_CANCELLED,
        fromState: checkIn.status,
        toState: CheckInStatus.CANCELLED,
        actorId: passengerId,
        metadata: { flightId: checkIn.flightId },
      });
      await manager.save(AuditLog, checkInAudit);
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

  private async validateBaggageWeight(
    passengerId: string,
    baggageWeight: number,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService
          .get(`${this.weightServiceUrl}/api/v1/baggage/weight/${passengerId}`)
          .pipe(timeout(HTTP_TIMEOUT_MS)),
      );
    } catch (error) {
      this.logger.warn(
        `Weight service validation failed for passenger '${passengerId}', proceeding with declared weight: ${baggageWeight}kg`,
      );
    }
  }

  private async handleExcessBaggage({
    checkIn,
    baggageWeight,
  }: {
    checkIn: CheckIn;
    baggageWeight: number;
  }): Promise<CheckInResponseDto> {
    const excessFee =
      Math.round(
        (baggageWeight - this.maxBaggageKg) * this.excessFeePerKg * 100,
      ) / 100;
    await this.checkInRepository.update(
      { id: checkIn.id },
      {
        status: CheckInStatus.AWAITING_PAYMENT,
        baggageWeight: String(baggageWeight),
        excessFee: String(excessFee),
      },
    );
    const paymentResult = await this.processPayment({
      checkInId: checkIn.id,
      passengerId: checkIn.passengerId,
      amount: excessFee,
    });
    if (paymentResult) {
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

  private async processPayment({
    checkInId,
    passengerId,
    amount,
  }: {
    checkInId: string;
    passengerId: string;
    amount: number;
  }): Promise<{ transactionId: string } | null> {
    try {
      const response: AxiosResponse<{ transactionId: string; status: string }> =
        await firstValueFrom(
          this.httpService
            .post<{
              transactionId: string;
              status: string;
            }>(`${this.paymentServiceUrl}/api/v1/payments`, { passengerId, amount, currency: "USD", checkInId })
            .pipe(timeout(HTTP_TIMEOUT_MS), retry(HTTP_RETRY_COUNT)),
        );
      const { transactionId, status } = response.data;
      if (status === "confirmed") {
        this.logger.log(
          `Payment confirmed for check-in '${checkInId}': txn=${transactionId}`,
        );
        return { transactionId };
      }
      return null;
    } catch (error) {
      this.logger.warn(
        `Payment failed/timed out for check-in '${checkInId}': ${(error as Error).message}`,
      );
      return null;
    }
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
        const seatAudit = manager.create(AuditLog, {
          entityType: "seat",
          entityId: seatId,
          action: AuditAction.SEAT_CONFIRMED,
          fromState: SeatStatus.HELD,
          toState: SeatStatus.CONFIRMED,
          actorId: checkIn.passengerId,
          metadata: { flightId: checkIn.flightId, checkInId: checkIn.id },
        });
        await manager.save(AuditLog, seatAudit);
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
      const checkInAudit = manager.create(AuditLog, {
        entityType: "check_in",
        entityId: checkIn.id,
        action: AuditAction.CHECKIN_COMPLETED,
        fromState: checkIn.status,
        toState: CheckInStatus.COMPLETED,
        actorId: checkIn.passengerId,
        metadata: { flightId: checkIn.flightId, paymentId },
      });
      await manager.save(AuditLog, checkInAudit);
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
