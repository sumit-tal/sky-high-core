import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource, Repository } from "typeorm";
import { CheckInService, WAITLIST_PROCESS_EVENT } from "./check-in.service";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { SeatService } from "../seat/seat.service";
import { BaggageService } from "../baggage/baggage.service";
import { PaymentService } from "../payment/payment.service";
import { RedisService } from "../common/redis";
import {
  FlightNotFoundException,
  SeatNotFoundException,
  SeatAlreadyHeldException,
  AlreadyCheckedInException,
  CheckInNotFoundException,
  HoldExpiredException,
  CancellationNotAllowedException,
} from "../common/filters/exceptions";
import {
  SeatStatus,
  CheckInStatus,
  FlightStatus,
  AuditAction,
} from "../common/types/enums";
import { StartCheckInRequestDto, CheckInAction } from "./dto";

const PASSENGER_ID = "passenger-uuid-1";
const FLIGHT_ID = "flight-uuid-1";
const SEAT_ID = "seat-uuid-1";
const CHECKIN_ID = "checkin-uuid-1";

const mockFlight: Partial<Flight> = {
  id: FLIGHT_ID,
  flightNumber: "SH-1042",
  status: FlightStatus.SCHEDULED,
};

const mockDepartedFlight: Partial<Flight> = {
  ...mockFlight,
  status: FlightStatus.DEPARTED,
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

const mockSeatHeld: Partial<Seat> = {
  ...mockSeatAvailable,
  status: SeatStatus.HELD,
  heldBy: "other-passenger-uuid",
  heldAt: new Date(),
};

const mockCheckIn: Partial<CheckIn> = {
  id: CHECKIN_ID,
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
  status: CheckInStatus.IN_PROGRESS,
  baggageWeight: null,
  excessFee: null,
  paymentId: null,
  createdAt: new Date("2026-02-14T15:18:00Z"),
};

const mockCompletedCheckIn: Partial<CheckIn> = {
  ...mockCheckIn,
  status: CheckInStatus.COMPLETED,
  baggageWeight: "20",
};

const mockDto: StartCheckInRequestDto = {
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
};

const mockLock = { release: jest.fn() };

const mockTransactionManager = {
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe("CheckInService", () => {
  let service: CheckInService;
  let checkInRepository: jest.Mocked<Repository<CheckIn>>;
  let seatRepository: jest.Mocked<Repository<Seat>>;
  let flightRepository: jest.Mocked<Repository<Flight>>;
  let redisService: jest.Mocked<RedisService>;
  let seatService: jest.Mocked<SeatService>;
  let baggageService: jest.Mocked<BaggageService>;
  let paymentService: jest.Mocked<PaymentService>;
  let dataSource: jest.Mocked<DataSource>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    mockTransactionManager.update.mockReset();
    mockTransactionManager.create.mockReset();
    mockTransactionManager.save.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInService,
        {
          provide: getRepositoryToken(CheckIn),
          useValue: {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Seat),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Flight),
          useValue: {
            findOne: jest.fn(),
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
            setSeatHold: jest.fn(),
            exists: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: SeatService,
          useValue: {
            invalidateCache: jest.fn(),
          },
        },
        {
          provide: BaggageService,
          useValue: {
            validateAndCalculateFee: jest.fn(),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            processPayment: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CheckInService>(CheckInService);
    checkInRepository = module.get(getRepositoryToken(CheckIn));
    seatRepository = module.get(getRepositoryToken(Seat));
    flightRepository = module.get(getRepositoryToken(Flight));
    dataSource = module.get(DataSource);
    redisService = module.get(RedisService);
    seatService = module.get(SeatService);
    baggageService = module.get(BaggageService);
    paymentService = module.get(PaymentService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe("startCheckIn", () => {
    it("When valid request, Then holds seat and returns check-in with IN_PROGRESS status", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.startCheckIn({
        passengerId: PASSENGER_ID,
        dto: mockDto,
      });
      expect(result.id).toBe(CHECKIN_ID);
      expect(result.passengerId).toBe(PASSENGER_ID);
      expect(result.flightId).toBe(FLIGHT_ID);
      expect(result.seatId).toBe(SEAT_ID);
      expect(result.status).toBe(CheckInStatus.IN_PROGRESS);
      expect(result.holdExpiresAt).toBeDefined();
      expect(result.holdExpiresAt).toBeInstanceOf(Date);
    });

    it("When valid request, Then acquires and releases Redlock", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(redisService.acquireLock).toHaveBeenCalledWith(
        "lock:seat:seat-uuid-1",
        5000,
      );
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When valid request, Then sets Redis hold key with 120s TTL", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(redisService.setSeatHold).toHaveBeenCalledWith(
        "hold:seat-uuid-1",
        PASSENGER_ID,
      );
    });

    it("When valid request, Then invalidates seat map cache", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it("When valid request, Then creates audit log entry for SEAT_HELD", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          entityType: "seat",
          entityId: SEAT_ID,
          action: AuditAction.SEAT_HELD,
          fromState: SeatStatus.AVAILABLE,
          toState: SeatStatus.HELD,
          actorId: PASSENGER_ID,
        }),
      );
    });

    it("When flight does not exist, Then throws FlightNotFoundException", async () => {
      flightRepository.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(FlightNotFoundException);
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it("When seat does not belong to flight, Then throws SeatNotFoundException", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(SeatNotFoundException);
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it("When passenger already has active check-in, Then throws AlreadyCheckedInException", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne.mockResolvedValue(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.IN_PROGRESS,
      } as CheckIn);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(AlreadyCheckedInException);
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it("When passenger has cancelled check-in, Then allows new check-in", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.CANCELLED,
      } as CheckIn);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue(mockCheckIn);
      mockTransactionManager.save
        .mockResolvedValueOnce(mockCheckIn)
        .mockResolvedValueOnce({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.startCheckIn({
        passengerId: PASSENGER_ID,
        dto: mockDto,
      });
      expect(result.status).toBe(CheckInStatus.IN_PROGRESS);
    });

    it("When seat is not AVAILABLE inside lock, Then throws SeatAlreadyHeldException", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatHeld as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(SeatAlreadyHeldException);
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When CAS update affects 0 rows, Then throws SeatAlreadyHeldException", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 0 });
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(SeatAlreadyHeldException);
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When lock acquired but transaction fails, Then still releases lock", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      dataSource.transaction.mockRejectedValue(new Error("DB error"));
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow("DB error");
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });
  });

  describe("getCheckIn", () => {
    it("When valid check-in ID, Then returns check-in details", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      const result = await service.getCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(result.id).toBe(CHECKIN_ID);
      expect(result.status).toBe(CheckInStatus.IN_PROGRESS);
      expect(result.holdExpiresAt).toBeInstanceOf(Date);
    });

    it("When check-in not found, Then throws CheckInNotFoundException", async () => {
      checkInRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
        }),
      ).rejects.toThrow(CheckInNotFoundException);
    });

    it("When check-in is COMPLETED, Then holdExpiresAt is null", async () => {
      checkInRepository.findOne.mockResolvedValue(
        mockCompletedCheckIn as CheckIn,
      );
      const result = await service.getCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(result.holdExpiresAt).toBeNull();
    });
  });

  describe("confirmCheckIn", () => {
    it("When valid confirm with no excess baggage, Then completes check-in", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(true);
      baggageService.validateAndCalculateFee.mockResolvedValue({
        weight: 20,
        maxAllowedWeight: 25,
        isOverweight: false,
        excessWeight: 0,
        excessFee: 0,
      });
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      checkInRepository.findOneOrFail.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.COMPLETED,
        baggageWeight: "20",
      } as CheckIn);
      const result = await service.confirmCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto: { action: CheckInAction.CONFIRM, baggageWeight: 20 },
      });
      expect(result.status).toBe(CheckInStatus.COMPLETED);
    });

    it("When hold expired (Redis key missing), Then throws HoldExpiredException", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(false);
      await expect(
        service.confirmCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
          dto: { action: CheckInAction.CONFIRM, baggageWeight: 20 },
        }),
      ).rejects.toThrow(HoldExpiredException);
    });

    it("When check-in is CANCELLED, Then throws HoldExpiredException", async () => {
      checkInRepository.findOne.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.CANCELLED,
      } as CheckIn);
      await expect(
        service.confirmCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
          dto: { action: CheckInAction.CONFIRM },
        }),
      ).rejects.toThrow(HoldExpiredException);
    });

    it("When check-in not found, Then throws CheckInNotFoundException", async () => {
      checkInRepository.findOne.mockResolvedValue(null);
      await expect(
        service.confirmCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
          dto: { action: CheckInAction.CONFIRM },
        }),
      ).rejects.toThrow(CheckInNotFoundException);
    });

    it("When excess baggage and payment succeeds, Then completes check-in with paymentId", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(true);
      baggageService.validateAndCalculateFee.mockResolvedValue({
        weight: 30,
        maxAllowedWeight: 25,
        isOverweight: true,
        excessWeight: 5,
        excessFee: 50,
      });
      checkInRepository.update.mockResolvedValue({ affected: 1 } as any);
      paymentService.processPayment.mockResolvedValue({
        success: true,
        transactionId: "txn_123",
        status: "confirmed",
        errorMessage: null,
      });
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      checkInRepository.findOneOrFail.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.COMPLETED,
        baggageWeight: "30",
        excessFee: "50.00",
        paymentId: "txn_123",
      } as CheckIn);
      const result = await service.confirmCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto: { action: CheckInAction.CONFIRM, baggageWeight: 30 },
      });
      expect(result.status).toBe(CheckInStatus.COMPLETED);
    });

    it("When excess baggage and payment fails, Then returns AWAITING_PAYMENT with message", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(true);
      baggageService.validateAndCalculateFee.mockResolvedValue({
        weight: 30,
        maxAllowedWeight: 25,
        isOverweight: true,
        excessWeight: 5,
        excessFee: 50,
      });
      checkInRepository.update.mockResolvedValue({ affected: 1 } as any);
      paymentService.processPayment.mockResolvedValue({
        success: false,
        transactionId: null,
        status: "failed",
        errorMessage: "Payment timeout",
      });
      checkInRepository.findOneOrFail.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.AWAITING_PAYMENT,
        baggageWeight: "30",
        excessFee: "50.00",
      } as CheckIn);
      const result = await service.confirmCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto: { action: CheckInAction.CONFIRM, baggageWeight: 30 },
      });
      expect(result.status).toBe(CheckInStatus.AWAITING_PAYMENT);
      expect(result.message).toContain("Excess baggage fee");
    });

    it("When confirm completes, Then deletes Redis hold key and invalidates cache", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(true);
      baggageService.validateAndCalculateFee.mockResolvedValue({
        weight: 20,
        maxAllowedWeight: 25,
        isOverweight: false,
        excessWeight: 0,
        excessFee: 0,
      });
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      checkInRepository.findOneOrFail.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.COMPLETED,
      } as CheckIn);
      await service.confirmCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto: { action: CheckInAction.CONFIRM, baggageWeight: 20 },
      });
      expect(redisService.del).toHaveBeenCalledWith("hold:seat-uuid-1");
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it("When confirm completes, Then creates SEAT_CONFIRMED and CHECKIN_COMPLETED audit logs", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      redisService.exists.mockResolvedValue(true);
      baggageService.validateAndCalculateFee.mockResolvedValue({
        weight: 20,
        maxAllowedWeight: 25,
        isOverweight: false,
        excessWeight: 0,
        excessFee: 0,
      });
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      checkInRepository.findOneOrFail.mockResolvedValue({
        ...mockCheckIn,
        status: CheckInStatus.COMPLETED,
      } as CheckIn);
      await service.confirmCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto: { action: CheckInAction.CONFIRM, baggageWeight: 20 },
      });
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.SEAT_CONFIRMED,
          fromState: SeatStatus.HELD,
          toState: SeatStatus.CONFIRMED,
        }),
      );
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.CHECKIN_COMPLETED,
          toState: CheckInStatus.COMPLETED,
        }),
      );
    });
  });

  describe("cancelCheckIn", () => {
    it("When valid cancel request, Then cancels check-in and returns cancelled response", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.cancelCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(result.status).toBe("CANCELLED");
      expect(result.id).toBe(CHECKIN_ID);
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it("When flight has departed, Then throws CancellationNotAllowedException", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      flightRepository.findOne.mockResolvedValue(mockDepartedFlight as Flight);
      await expect(
        service.cancelCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
        }),
      ).rejects.toThrow(CancellationNotAllowedException);
    });

    it("When check-in not found, Then throws CheckInNotFoundException", async () => {
      checkInRepository.findOne.mockResolvedValue(null);
      await expect(
        service.cancelCheckIn({
          checkInId: CHECKIN_ID,
          passengerId: PASSENGER_ID,
        }),
      ).rejects.toThrow(CheckInNotFoundException);
    });

    it("When cancel succeeds, Then deletes Redis hold key and invalidates cache", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.cancelCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(redisService.del).toHaveBeenCalledWith("hold:seat-uuid-1");
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it("When cancel succeeds, Then emits waitlist process event", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.cancelCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(WAITLIST_PROCESS_EVENT, {
        flightId: FLIGHT_ID,
      });
    });

    it("When cancel succeeds, Then creates SEAT_CANCELLED and CHECKIN_CANCELLED audit logs", async () => {
      checkInRepository.findOne.mockResolvedValue(mockCheckIn as CheckIn);
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      mockTransactionManager.update.mockResolvedValue({ affected: 1 });
      mockTransactionManager.create.mockReturnValue({});
      mockTransactionManager.save.mockResolvedValue({});
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockTransactionManager),
      );
      redisService.del.mockResolvedValue(1);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.cancelCheckIn({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.SEAT_CANCELLED,
          toState: SeatStatus.AVAILABLE,
        }),
      );
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.CHECKIN_CANCELLED,
          toState: CheckInStatus.CANCELLED,
        }),
      );
    });
  });
});
