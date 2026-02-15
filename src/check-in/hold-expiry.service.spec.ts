import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource, Repository, SelectQueryBuilder } from "typeorm";
import { HoldExpiryService } from "./hold-expiry.service";
import { Seat } from "../seat/seat.entity";
import { CheckIn } from "./check-in.entity";
import { Waitlist } from "../waitlist/waitlist.entity";
import { AuditService } from "../audit/audit.service";
import { SeatService } from "../seat/seat.service";
import { RedisService } from "../common/redis";
import { MetricsService } from "../common/observability";
import { createMockMetricsService } from "../common/observability/metrics.service.mock";
import {
  SeatStatus,
  CheckInStatus,
  WaitlistStatus,
  AuditAction,
} from "../common/types/enums";
import type { SeatHoldExpiredEvent } from "../common/redis";

const PASSENGER_ID = "passenger-uuid-1";
const FLIGHT_ID = "flight-uuid-1";
const SEAT_ID = "seat-uuid-1";
const expiredHeldAt = new Date(Date.now() - 130_000);

const mockSeatHeldExpired: Partial<Seat> = {
  id: SEAT_ID,
  flightId: FLIGHT_ID,
  row: 1,
  column: "A",
  status: SeatStatus.HELD,
  heldBy: PASSENGER_ID,
  heldAt: expiredHeldAt,
};

const mockSeatAvailable: Partial<Seat> = {
  id: SEAT_ID,
  flightId: FLIGHT_ID,
  row: 1,
  column: "A",
  status: SeatStatus.AVAILABLE,
  heldBy: null,
  heldAt: null,
};

const mockSeatHeldNotExpired: Partial<Seat> = {
  id: SEAT_ID,
  flightId: FLIGHT_ID,
  row: 1,
  column: "A",
  status: SeatStatus.HELD,
  heldBy: PASSENGER_ID,
  heldAt: new Date(),
};

const mockLock = { release: jest.fn() };

const mockTransactionManager = {
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe("HoldExpiryService", () => {
  let service: HoldExpiryService;
  let seatRepository: jest.Mocked<Repository<Seat>>;
  let waitlistRepository: jest.Mocked<Repository<Waitlist>>;
  let redisService: jest.Mocked<RedisService>;
  let seatService: jest.Mocked<SeatService>;
  let dataSource: jest.Mocked<DataSource>;
  let auditService: jest.Mocked<AuditService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldExpiryService,
        {
          provide: getRepositoryToken(Seat),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            acquireLock: jest.fn(),
            releaseLock: jest.fn(),
          },
        },
        {
          provide: SeatService,
          useValue: {
            invalidateCache: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Waitlist),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
            logWithTransaction: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: MetricsService,
          useValue: createMockMetricsService(),
        },
      ],
    }).compile();
    service = module.get<HoldExpiryService>(HoldExpiryService);
    seatRepository = module.get(getRepositoryToken(Seat));
    waitlistRepository = module.get(getRepositoryToken(Waitlist));
    dataSource = module.get(DataSource);
    redisService = module.get(RedisService);
    seatService = module.get(SeatService);
    auditService = module.get(AuditService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe("handleHoldExpired", () => {
    it("When keyspace expiry event received, Then calls releaseSeat with seatId", async () => {
      const event: SeatHoldExpiredEvent = {
        seatId: SEAT_ID,
        key: `hold:${SEAT_ID}`,
      };
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.handleHoldExpired(event);
      expect(redisService.acquireLock).toHaveBeenCalledWith(
        `lock:seat:${SEAT_ID}`,
        5000,
      );
    });
  });

  describe("releaseSeat", () => {
    it("When seat is HELD and expired, Then releases seat and returns true", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(true);
    });

    it("When seat is HELD and expired, Then performs CAS update with correct WHERE clause", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(mockTransactionManager.update).toHaveBeenCalledWith(
        Seat,
        { id: SEAT_ID, status: SeatStatus.HELD, heldBy: PASSENGER_ID },
        { status: SeatStatus.AVAILABLE, heldBy: null, heldAt: null },
      );
    });

    it("When seat is HELD and expired, Then cancels IN_PROGRESS check-in", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(mockTransactionManager.update).toHaveBeenCalledWith(
        CheckIn,
        { seatId: SEAT_ID, status: CheckInStatus.IN_PROGRESS },
        { status: CheckInStatus.CANCELLED },
      );
    });

    it("When seat is HELD and expired, Then creates SEAT_RELEASED audit log", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(auditService.logWithTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          manager: mockTransactionManager,
          dto: expect.objectContaining({
            entityType: "seat",
            entityId: SEAT_ID,
            action: AuditAction.SEAT_RELEASED,
            fromState: SeatStatus.HELD,
            toState: SeatStatus.AVAILABLE,
            actorId: PASSENGER_ID,
          }),
        }),
      );
    });

    it("When seat is HELD and expired, Then invalidates seat map cache", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it("When seat is HELD and expired, Then acquires and releases Redlock", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(redisService.acquireLock).toHaveBeenCalledWith(
        `lock:seat:${SEAT_ID}`,
        5000,
      );
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When lock cannot be acquired, Then returns false and skips release", async () => {
      redisService.acquireLock.mockRejectedValue(new Error("Lock contention"));
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(false);
      expect(seatRepository.findOne).not.toHaveBeenCalled();
    });

    it("When seat is not in HELD state, Then returns false (no-op)", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatAvailable as Seat);
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(false);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When seat is not found, Then returns false (no-op)", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(null);
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(false);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When hold has not expired yet, Then returns false (no-op)", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldNotExpired as Seat);
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(false);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When CAS update affects 0 rows (double-release), Then returns false", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 0 });
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      const result = await service.releaseSeat(SEAT_ID);
      expect(result).toBe(false);
      expect(seatService.invalidateCache).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When transaction fails, Then still releases lock", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      dataSource.transaction.mockRejectedValue(new Error("DB error"));
      await expect(service.releaseSeat(SEAT_ID)).rejects.toThrow("DB error");
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When hold expires, Then emits waitlist process event for the flight", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.releaseSeat(SEAT_ID);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "waitlist.process",
        expect.objectContaining({ flightId: FLIGHT_ID, seatId: SEAT_ID }),
      );
    });

    it("When hold expires and waitlist entry exists, Then marks entry as EXPIRED", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      const mockWaitlistEntry = {
        id: "waitlist-uuid-1",
        flightId: FLIGHT_ID,
        passengerId: PASSENGER_ID,
        status: WaitlistStatus.ASSIGNED,
      };
      waitlistRepository.findOne.mockResolvedValue(mockWaitlistEntry as any);
      waitlistRepository.save.mockResolvedValue({
        ...mockWaitlistEntry,
        status: WaitlistStatus.EXPIRED,
      } as any);
      await service.releaseSeat(SEAT_ID);
      expect(waitlistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.EXPIRED }),
      );
    });
  });

  describe("sweepExpiredHolds", () => {
    it("When stale holds found, Then calls releaseSeat for each", async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...mockSeatHeldExpired, id: "seat-1" },
          { ...mockSeatHeldExpired, id: "seat-2" },
        ]),
      } as unknown as SelectQueryBuilder<Seat>;
      seatRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      seatRepository.findOne.mockResolvedValue(mockSeatHeldExpired as Seat);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.sweepExpiredHolds();
      expect(redisService.acquireLock).toHaveBeenCalledTimes(2);
    });

    it("When no stale holds found, Then does nothing", async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as unknown as SelectQueryBuilder<Seat>;
      seatRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );
      await service.sweepExpiredHolds();
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });
  });
});
