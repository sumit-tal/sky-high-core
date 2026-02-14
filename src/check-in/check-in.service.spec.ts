import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CheckInService } from './check-in.service';
import { CheckIn } from './check-in.entity';
import { Seat } from '../seat/seat.entity';
import { Flight } from '../flight/flight.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { SeatService } from '../seat/seat.service';
import { RedisService } from '../common/redis';
import {
  FlightNotFoundException,
  SeatNotFoundException,
  SeatAlreadyHeldException,
  AlreadyCheckedInException,
} from '../common/filters/exceptions';
import { SeatStatus, CheckInStatus, FlightStatus, AuditAction } from '../common/types/enums';
import { StartCheckInRequestDto } from './dto';

const PASSENGER_ID = 'passenger-uuid-1';
const FLIGHT_ID = 'flight-uuid-1';
const SEAT_ID = 'seat-uuid-1';

const mockFlight: Partial<Flight> = {
  id: FLIGHT_ID,
  flightNumber: 'SH-1042',
  status: FlightStatus.SCHEDULED,
};

const mockSeatAvailable: Partial<Seat> = {
  id: SEAT_ID,
  flightId: FLIGHT_ID,
  row: 1,
  column: 'A',
  status: SeatStatus.AVAILABLE,
  heldBy: null,
  heldAt: null,
};

const mockSeatHeld: Partial<Seat> = {
  ...mockSeatAvailable,
  status: SeatStatus.HELD,
  heldBy: 'other-passenger-uuid',
  heldAt: new Date(),
};

const mockCheckIn: Partial<CheckIn> = {
  id: 'checkin-uuid-1',
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
  status: CheckInStatus.IN_PROGRESS,
  baggageWeight: null,
  excessFee: null,
  paymentId: null,
  createdAt: new Date('2026-02-14T15:18:00Z'),
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

describe('CheckInService', () => {
  let service: CheckInService;
  let checkInRepository: jest.Mocked<Repository<CheckIn>>;
  let seatRepository: jest.Mocked<Repository<Seat>>;
  let flightRepository: jest.Mocked<Repository<Flight>>;
  let redisService: jest.Mocked<RedisService>;
  let seatService: jest.Mocked<SeatService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInService,
        {
          provide: getRepositoryToken(CheckIn),
          useValue: {
            findOne: jest.fn(),
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
          },
        },
        {
          provide: SeatService,
          useValue: {
            invalidateCache: jest.fn(),
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
  });

  describe('startCheckIn', () => {
    it('When valid request, Then holds seat and returns check-in with IN_PROGRESS status', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(result.id).toBe('checkin-uuid-1');
      expect(result.passengerId).toBe(PASSENGER_ID);
      expect(result.flightId).toBe(FLIGHT_ID);
      expect(result.seatId).toBe(SEAT_ID);
      expect(result.status).toBe(CheckInStatus.IN_PROGRESS);
      expect(result.holdExpiresAt).toBeDefined();
      expect(result.holdExpiresAt).toBeInstanceOf(Date);
    });

    it('When valid request, Then acquires and releases Redlock', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(redisService.acquireLock).toHaveBeenCalledWith('lock:seat:seat-uuid-1', 5000);
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it('When valid request, Then sets Redis hold key with 120s TTL', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(redisService.setSeatHold).toHaveBeenCalledWith('hold:seat-uuid-1', PASSENGER_ID);
    });

    it('When valid request, Then invalidates seat map cache', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it('When valid request, Then creates audit log entry for SEAT_HELD', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(mockTransactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          entityType: 'seat',
          entityId: SEAT_ID,
          action: AuditAction.SEAT_HELD,
          fromState: SeatStatus.AVAILABLE,
          toState: SeatStatus.HELD,
          actorId: PASSENGER_ID,
        }),
      );
    });

    it('When flight does not exist, Then throws FlightNotFoundException', async () => {
      flightRepository.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(FlightNotFoundException);
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it('When seat does not belong to flight, Then throws SeatNotFoundException', async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne.mockResolvedValue(null);
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(SeatNotFoundException);
      expect(redisService.acquireLock).not.toHaveBeenCalled();
    });

    it('When passenger already has active check-in, Then throws AlreadyCheckedInException', async () => {
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

    it('When passenger has cancelled check-in, Then allows new check-in', async () => {
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
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      redisService.setSeatHold.mockResolvedValue(undefined);
      seatService.invalidateCache.mockResolvedValue(undefined);
      const result = await service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto });
      expect(result.status).toBe(CheckInStatus.IN_PROGRESS);
    });

    it('When seat is not AVAILABLE inside lock, Then throws SeatAlreadyHeldException', async () => {
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

    it('When CAS update affects 0 rows, Then throws SeatAlreadyHeldException', async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      mockTransactionManager.update.mockResolvedValue({ affected: 0 });
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow(SeatAlreadyHeldException);
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it('When lock acquired but transaction fails, Then still releases lock', async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight as Flight);
      seatRepository.findOne
        .mockResolvedValueOnce(mockSeatAvailable as Seat)
        .mockResolvedValueOnce(mockSeatAvailable as Seat);
      checkInRepository.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      dataSource.transaction.mockRejectedValue(new Error('DB error'));
      await expect(
        service.startCheckIn({ passengerId: PASSENGER_ID, dto: mockDto }),
      ).rejects.toThrow('DB error');
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });
  });
});
