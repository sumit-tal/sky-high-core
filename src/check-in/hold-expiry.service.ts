import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Seat } from "../seat/seat.entity";
import { CheckIn } from "./check-in.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { SeatService } from "../seat/seat.service";
import {
  RedisService,
  RedisKey,
  SEAT_HOLD_EXPIRED_EVENT,
  type SeatHoldExpiredEvent,
} from "../common/redis";
import { SeatStatus, CheckInStatus, AuditAction } from "../common/types/enums";
import { REDIS_TTL } from "../common/redis";

const LOCK_TTL_MS = REDIS_TTL.SEAT_LOCK * 1000;
const HOLD_DURATION_SECONDS = REDIS_TTL.SEAT_HOLD;
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Dual-mechanism hold expiry service.
 * Primary: Redis keyspace notification listener (event-driven).
 * Fallback: Background sweep job (cron-based, every 30s by default).
 * Both paths use the same CAS release logic to guarantee at-most-once semantics.
 */
@Injectable()
export class HoldExpiryService {
  private readonly logger = new Logger(HoldExpiryService.name);

  constructor(
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly seatService: SeatService,
  ) {}

  /**
   * Primary mechanism — listens for Redis keyspace expiry events.
   * Triggered when a `hold:{seatId}` key expires after 120s TTL.
   */
  @OnEvent(SEAT_HOLD_EXPIRED_EVENT)
  async handleHoldExpired(event: SeatHoldExpiredEvent): Promise<void> {
    this.logger.log(`Keyspace expiry received for seat: ${event.seatId}`);
    await this.releaseSeat(event.seatId);
  }

  /**
   * Fallback mechanism — background sweep every 30 seconds.
   * Finds all seats stuck in HELD state past the hold duration.
   */
  @Cron("*/30 * * * * *")
  async sweepExpiredHolds(): Promise<void> {
    const cutoff = new Date(Date.now() - HOLD_DURATION_SECONDS * 1000);
    const staleSeats = await this.seatRepository
      .createQueryBuilder("seat")
      .where("seat.status = :status", { status: SeatStatus.HELD })
      .andWhere("seat.held_at <= :cutoff", { cutoff })
      .getMany();
    if (staleSeats.length === 0) {
      return;
    }
    this.logger.log(`Sweep found ${staleSeats.length} stale hold(s)`);
    for (const seat of staleSeats) {
      await this.releaseSeat(seat.id);
    }
  }

  /**
   * Core CAS release logic shared by both expiry mechanisms.
   * 1. Acquire Redlock on lock:seat:{seatId}
   * 2. Verify seat is HELD and hold has expired (CAS guard)
   * 3. UPDATE seat → AVAILABLE, clear held_by/held_at
   * 4. UPDATE check_in → CANCELLED (if not already confirmed)
   * 5. INSERT audit_log (SEAT_RELEASED)
   * 6. Trigger waitlist processing (event)
   * 7. Invalidate seat map cache
   * 8. Release lock
   */
  async releaseSeat(seatId: string): Promise<boolean> {
    const lockKey = RedisKey.seatLock(seatId);
    let lock;
    try {
      lock = await this.redisService.acquireLock(lockKey, LOCK_TTL_MS);
    } catch (error) {
      this.logger.warn(
        `Could not acquire lock for seat ${seatId}, skipping release`,
      );
      return false;
    }
    try {
      return await this.releaseSeatWithinLock(seatId);
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async releaseSeatWithinLock(seatId: string): Promise<boolean> {
    const seat = await this.seatRepository.findOne({ where: { id: seatId } });
    if (!seat || seat.status !== SeatStatus.HELD) {
      this.logger.debug(`Seat ${seatId} is not in HELD state, skipping`);
      return false;
    }
    const holdExpiry = new Date(
      (seat.heldAt?.getTime() ?? 0) + HOLD_DURATION_SECONDS * 1000,
    );
    if (holdExpiry > new Date()) {
      this.logger.debug(`Seat ${seatId} hold has not expired yet, skipping`);
      return false;
    }
    const passengerId = seat.heldBy;
    const updateResult = await this.dataSource.transaction(async (manager) => {
      const casResult = await manager.update(
        Seat,
        { id: seatId, status: SeatStatus.HELD, heldBy: passengerId },
        { status: SeatStatus.AVAILABLE, heldBy: null, heldAt: null },
      );
      if (casResult.affected === 0) {
        return false;
      }
      await manager.update(
        CheckIn,
        { seatId, status: CheckInStatus.IN_PROGRESS },
        { status: CheckInStatus.CANCELLED },
      );
      const auditLog = manager.create(AuditLog, {
        entityType: "seat",
        entityId: seatId,
        action: AuditAction.SEAT_RELEASED,
        fromState: SeatStatus.HELD,
        toState: SeatStatus.AVAILABLE,
        actorId: passengerId ?? SYSTEM_ACTOR_ID,
        metadata: { reason: "hold_expired", flightId: seat.flightId },
      });
      await manager.save(AuditLog, auditLog);
      return true;
    });
    if (!updateResult) {
      this.logger.debug(
        `CAS update failed for seat ${seatId}, already released`,
      );
      return false;
    }
    await this.seatService.invalidateCache(seat.flightId);
    this.logger.log(
      `Seat ${seatId} released (hold expired) on flight ${seat.flightId}`,
    );
    return true;
  }
}
