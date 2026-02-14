import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { CheckInResponseDto, StartCheckInRequestDto } from "./dto";
import { RedisService, RedisKey, REDIS_TTL } from "../common/redis";
import { SeatService } from "../seat/seat.service";
import { SeatStatus, CheckInStatus, AuditAction } from "../common/types/enums";
import {
  FlightNotFoundException,
  SeatNotFoundException,
  SeatAlreadyHeldException,
  AlreadyCheckedInException,
} from "../common/filters/exceptions";

const LOCK_TTL_MS = REDIS_TTL.SEAT_LOCK * 1000;
const HOLD_TTL_SECONDS = REDIS_TTL.SEAT_HOLD;

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
    return this.toCheckInResponse(checkIn, holdExpiresAt);
  }

  private toCheckInResponse(
    checkIn: CheckIn,
    holdExpiresAt: Date | null,
  ): CheckInResponseDto {
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
      createdAt: checkIn.createdAt,
    };
  }
}
