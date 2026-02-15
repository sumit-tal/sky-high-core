import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { DataSource, Repository } from "typeorm";
import { Waitlist } from "./waitlist.entity";
import { WaitlistResponseDto } from "./dto";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { CheckIn } from "../check-in/check-in.entity";
import { AuditService } from "../audit/audit.service";
/* CheckIn entity is used within transactions via DataSource manager */
import { RedisService, RedisKey, REDIS_TTL } from "../common/redis";
import { MetricsService, withSpan } from "../common/observability";
import { SeatService } from "../seat/seat.service";
import {
  SeatStatus,
  CheckInStatus,
  WaitlistStatus,
  AuditAction,
} from "../common/types/enums";
import {
  FlightNotFoundException,
  AlreadyOnWaitlistException,
  WaitlistNotFoundException,
} from "../common/filters/exceptions";
import { WAITLIST_PROCESS_EVENT } from "../check-in/check-in.service";

const WAITLIST_LOCK_TTL_MS = REDIS_TTL.WAITLIST_LOCK * 1000;
const HOLD_TTL_SECONDS = REDIS_TTL.SEAT_HOLD;
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
export const WAITLIST_NOTIFICATION_EVENT = "waitlist.notification";

/**
 * Service for waitlist FIFO queue management and automatic seat assignment.
 * Implements Technical PRD §7.1 and §7.2.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(Waitlist)
    private readonly waitlistRepository: Repository<Waitlist>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly seatService: SeatService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Join the waitlist for a flight. Position is assigned in FIFO order.
   * @throws FlightNotFoundException if the flight does not exist.
   * @throws AlreadyOnWaitlistException if the passenger is already on the waitlist.
   */
  async joinWaitlist({
    passengerId,
    flightId,
  }: {
    passengerId: string;
    flightId: string;
  }): Promise<WaitlistResponseDto> {
    const flight = await this.flightRepository.findOne({
      where: { id: flightId },
    });
    if (!flight) {
      throw new FlightNotFoundException(
        `Flight with id '${flightId}' was not found`,
      );
    }
    const existing = await this.waitlistRepository.findOne({
      where: { flightId, passengerId, status: WaitlistStatus.WAITING },
    });
    if (existing) {
      throw new AlreadyOnWaitlistException(
        "Passenger is already on the waitlist for this flight.",
      );
    }
    const nextPosition = await this.getNextPosition(flightId);
    const entry = this.waitlistRepository.create({
      flightId,
      passengerId,
      position: nextPosition,
      status: WaitlistStatus.WAITING,
    });
    const saved = await this.waitlistRepository.save(entry);
    this.auditService.log({
      entityType: "waitlist",
      entityId: saved.id,
      action: AuditAction.WAITLIST_JOINED,
      fromState: null,
      toState: WaitlistStatus.WAITING,
      actorId: passengerId,
      metadata: { flightId, position: nextPosition },
    });
    this.metricsService.waitlistDepth.labels({ flight_id: flightId }).inc();
    this.logger.log(
      `Passenger '${passengerId}' joined waitlist for flight '${flightId}' at position ${nextPosition}`,
    );
    return this.toResponseDto(saved);
  }

  /**
   * Leave the waitlist. Only allowed if status is WAITING.
   * @throws WaitlistNotFoundException if the entry does not exist.
   */
  async leaveWaitlist({
    waitlistId,
    passengerId,
  }: {
    waitlistId: string;
    passengerId: string;
  }): Promise<WaitlistResponseDto> {
    const entry = await this.waitlistRepository.findOne({
      where: { id: waitlistId, passengerId },
    });
    if (!entry) {
      throw new WaitlistNotFoundException(
        `No waitlist entry found with id '${waitlistId}'`,
      );
    }
    if (entry.status !== WaitlistStatus.WAITING) {
      throw new WaitlistNotFoundException(
        `Waitlist entry '${waitlistId}' is not in WAITING status`,
      );
    }
    entry.status = WaitlistStatus.CANCELLED;
    const updated = await this.waitlistRepository.save(entry);
    this.metricsService.waitlistDepth
      .labels({ flight_id: entry.flightId })
      .dec();
    this.logger.log(
      `Passenger '${passengerId}' left waitlist entry '${waitlistId}'`,
    );
    return this.toResponseDto(updated);
  }

  /**
   * Get all waitlist entries for a flight ordered by FIFO position.
   * @throws FlightNotFoundException if the flight does not exist.
   */
  async getFlightWaitlist({
    flightId,
  }: {
    flightId: string;
  }): Promise<WaitlistResponseDto[]> {
    const flight = await this.flightRepository.findOne({
      where: { id: flightId },
    });
    if (!flight) {
      throw new FlightNotFoundException(
        `Flight with id '${flightId}' was not found`,
      );
    }
    const entries = await this.waitlistRepository.find({
      where: { flightId },
      order: { position: "ASC" },
    });
    return entries.map((entry) => this.toResponseDto(entry));
  }

  /**
   * Process waitlist for a flight when a seat becomes available.
   * Triggered by WAITLIST_PROCESS_EVENT from check-in cancellation or hold expiry.
   * Implements Technical PRD §7.1 auto-assignment flow.
   */
  @OnEvent(WAITLIST_PROCESS_EVENT)
  async processWaitlist(payload: {
    flightId: string;
    seatId?: string;
  }): Promise<void> {
    const { flightId } = payload;
    await withSpan(
      "waitlist.process",
      { flightId, seatId: payload.seatId ?? "any" },
      async () => {
        const lockKey = RedisKey.waitlistLock(flightId);
        let lock;
        try {
          lock = await this.redisService.acquireLock(
            lockKey,
            WAITLIST_LOCK_TTL_MS,
          );
        } catch {
          this.logger.warn(
            `Could not acquire waitlist lock for flight '${flightId}', skipping`,
          );
          return;
        }
        try {
          await this.processWaitlistWithinLock(flightId, payload.seatId);
        } finally {
          await this.redisService.releaseLock(lock);
        }
      },
    );
  }

  /**
   * Handle waitlist hold expiry: mark entry as EXPIRED and re-trigger processing.
   * Called when a waitlist-assigned hold expires (Technical PRD §7.2).
   */
  async handleWaitlistHoldExpiry({
    seatId,
    flightId,
    passengerId,
  }: {
    seatId: string;
    flightId: string;
    passengerId: string;
  }): Promise<void> {
    const entry = await this.waitlistRepository.findOne({
      where: {
        flightId,
        passengerId,
        status: WaitlistStatus.ASSIGNED,
      },
    });
    if (entry) {
      entry.status = WaitlistStatus.EXPIRED;
      await this.waitlistRepository.save(entry);
      this.logger.log(
        `Waitlist entry '${entry.id}' expired for passenger '${passengerId}'`,
      );
    }
    this.eventEmitter.emit(WAITLIST_PROCESS_EVENT, { flightId, seatId });
  }

  private async processWaitlistWithinLock(
    flightId: string,
    seatId?: string,
  ): Promise<void> {
    const nextPassenger = await this.waitlistRepository.findOne({
      where: { flightId, status: WaitlistStatus.WAITING },
      order: { position: "ASC" },
    });
    if (!nextPassenger) {
      this.logger.debug(
        `No waiting passengers on waitlist for flight '${flightId}'`,
      );
      return;
    }
    const availableSeat = seatId
      ? await this.seatRepository.findOne({
          where: { id: seatId, flightId, status: SeatStatus.AVAILABLE },
        })
      : await this.seatRepository.findOne({
          where: { flightId, status: SeatStatus.AVAILABLE },
        });
    if (!availableSeat) {
      this.logger.debug(
        `No available seats on flight '${flightId}' for waitlist`,
      );
      return;
    }
    await this.assignSeatToWaitlistPassenger({
      waitlistEntry: nextPassenger,
      seat: availableSeat,
      flightId,
    });
  }

  private async assignSeatToWaitlistPassenger({
    waitlistEntry,
    seat,
    flightId,
  }: {
    waitlistEntry: Waitlist;
    seat: Seat;
    flightId: string;
  }): Promise<void> {
    const passengerId = waitlistEntry.passengerId;
    const heldAt = new Date();
    const assigned = await this.dataSource.transaction(async (manager) => {
      const casResult = await manager.update(
        Seat,
        { id: seat.id, status: SeatStatus.AVAILABLE },
        { status: SeatStatus.HELD, heldBy: passengerId, heldAt },
      );
      if (casResult.affected === 0) {
        this.logger.warn(
          `CAS failed assigning seat '${seat.id}' to waitlist passenger '${passengerId}'`,
        );
        return false;
      }
      await manager.update(
        Waitlist,
        { id: waitlistEntry.id },
        { status: WaitlistStatus.ASSIGNED },
      );
      const checkInRecord = manager.create(CheckIn, {
        passengerId,
        flightId,
        seatId: seat.id,
        status: CheckInStatus.IN_PROGRESS,
      });
      await manager.save(CheckIn, checkInRecord);
      await this.auditService.logWithTransaction({
        manager,
        dto: {
          entityType: "waitlist",
          entityId: waitlistEntry.id,
          action: AuditAction.WAITLIST_ASSIGNED,
          fromState: WaitlistStatus.WAITING,
          toState: WaitlistStatus.ASSIGNED,
          actorId: SYSTEM_ACTOR_ID,
          metadata: {
            flightId,
            seatId: seat.id,
            passengerId,
            checkInId: checkInRecord.id,
          },
        },
      });
      return true;
    });
    if (!assigned) {
      return;
    }
    const holdKey = RedisKey.seatHold(seat.id);
    await this.redisService.setSeatHold(holdKey, passengerId, HOLD_TTL_SECONDS);
    await this.seatService.invalidateCache(flightId);
    this.metricsService.waitlistAssignmentTotal
      .labels({ flight_id: flightId })
      .inc();
    this.metricsService.waitlistDepth.labels({ flight_id: flightId }).dec();
    this.eventEmitter.emit(WAITLIST_NOTIFICATION_EVENT, {
      passengerId,
      flightId,
      seatId: seat.id,
      waitlistEntryId: waitlistEntry.id,
    });
    this.logger.log(
      `Waitlist: assigned seat '${seat.id}' to passenger '${passengerId}' on flight '${flightId}' (120s hold)`,
    );
  }

  private async getNextPosition(flightId: string): Promise<number> {
    const maxEntry = await this.waitlistRepository
      .createQueryBuilder("waitlist")
      .select("MAX(waitlist.position)", "maxPosition")
      .where("waitlist.flight_id = :flightId", { flightId })
      .getRawOne();
    return (maxEntry?.maxPosition ?? 0) + 1;
  }

  private toResponseDto(entry: Waitlist): WaitlistResponseDto {
    return {
      id: entry.id,
      flightId: entry.flightId,
      passengerId: entry.passengerId,
      position: entry.position,
      status: entry.status,
      createdAt: entry.createdAt,
    };
  }
}
