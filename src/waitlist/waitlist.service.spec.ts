import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource, Repository } from "typeorm";
import {
  WaitlistService,
  WAITLIST_NOTIFICATION_EVENT,
} from "./waitlist.service";
import { Waitlist } from "./waitlist.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { RedisService } from "../common/redis";
import { SeatService } from "../seat/seat.service";
import {
  SeatStatus,
  WaitlistStatus,
  FlightStatus,
} from "../common/types/enums";
import {
  FlightNotFoundException,
  AlreadyOnWaitlistException,
  WaitlistNotFoundException,
} from "../common/filters/exceptions";

const PASSENGER_ID = "passenger-uuid-1";
const PASSENGER_ID_2 = "passenger-uuid-2";
const FLIGHT_ID = "flight-uuid-1";
const SEAT_ID = "seat-uuid-1";
const WAITLIST_ID = "waitlist-uuid-1";

const mockFlight = {
  id: FLIGHT_ID,
  flightNumber: "SH-1042",
  status: FlightStatus.SCHEDULED,
} as Flight;

const mockSeat = {
  id: SEAT_ID,
  flightId: FLIGHT_ID,
  row: 1,
  column: "A",
  status: SeatStatus.AVAILABLE,
  heldBy: null,
  heldAt: null,
} as Seat;

const mockWaitlistEntry = {
  id: WAITLIST_ID,
  flightId: FLIGHT_ID,
  passengerId: PASSENGER_ID,
  position: 1,
  status: WaitlistStatus.WAITING,
  createdAt: new Date("2026-02-14T15:25:00Z"),
  updatedAt: new Date("2026-02-14T15:25:00Z"),
} as Waitlist;

describe("WaitlistService", () => {
  let service: WaitlistService;
  let waitlistRepository: jest.Mocked<Repository<Waitlist>>;
  let seatRepository: jest.Mocked<Repository<Seat>>;
  let flightRepository: jest.Mocked<Repository<Flight>>;
  let dataSource: jest.Mocked<DataSource>;
  let redisService: jest.Mocked<RedisService>;
  let seatService: jest.Mocked<SeatService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockManager = {
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        {
          provide: getRepositoryToken(Waitlist),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
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
            manager: {
              create: jest.fn() as jest.Mock,
              save: jest.fn() as jest.Mock,
            },
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
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
    waitlistRepository = module.get(getRepositoryToken(Waitlist));
    seatRepository = module.get(getRepositoryToken(Seat));
    flightRepository = module.get(getRepositoryToken(Flight));
    dataSource = module.get(DataSource);
    redisService = module.get(RedisService);
    seatService = module.get(SeatService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe("joinWaitlist", () => {
    it("When valid request, Then creates waitlist entry with FIFO position", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight);
      waitlistRepository.findOne.mockResolvedValue(null);
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxPosition: 2 }),
      };
      waitlistRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );
      const savedEntry = { ...mockWaitlistEntry, position: 3 };
      waitlistRepository.create.mockReturnValue(savedEntry as any);
      waitlistRepository.save.mockResolvedValue(savedEntry as any);
      (dataSource.manager.create as jest.Mock).mockReturnValue({} as any);
      (dataSource.manager.save as jest.Mock).mockResolvedValue({} as any);
      const result = await service.joinWaitlist({
        passengerId: PASSENGER_ID,
        flightId: FLIGHT_ID,
      });
      expect(result.position).toBe(3);
      expect(result.status).toBe(WaitlistStatus.WAITING);
      expect(result.flightId).toBe(FLIGHT_ID);
      expect(result.passengerId).toBe(PASSENGER_ID);
    });

    it("When flight not found, Then throws FlightNotFoundException", async () => {
      flightRepository.findOne.mockResolvedValue(null);
      await expect(
        service.joinWaitlist({
          passengerId: PASSENGER_ID,
          flightId: FLIGHT_ID,
        }),
      ).rejects.toThrow(FlightNotFoundException);
    });

    it("When passenger already on waitlist, Then throws AlreadyOnWaitlistException", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight);
      waitlistRepository.findOne.mockResolvedValue(mockWaitlistEntry as any);
      await expect(
        service.joinWaitlist({
          passengerId: PASSENGER_ID,
          flightId: FLIGHT_ID,
        }),
      ).rejects.toThrow(AlreadyOnWaitlistException);
    });

    it("When first entry on waitlist, Then position is 1", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight);
      waitlistRepository.findOne.mockResolvedValue(null);
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxPosition: null }),
      };
      waitlistRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );
      const savedEntry = { ...mockWaitlistEntry, position: 1 };
      waitlistRepository.create.mockReturnValue(savedEntry as any);
      waitlistRepository.save.mockResolvedValue(savedEntry as any);
      (dataSource.manager.create as jest.Mock).mockReturnValue({} as any);
      (dataSource.manager.save as jest.Mock).mockResolvedValue({} as any);
      const result = await service.joinWaitlist({
        passengerId: PASSENGER_ID,
        flightId: FLIGHT_ID,
      });
      expect(result.position).toBe(1);
    });
  });

  describe("leaveWaitlist", () => {
    it("When valid request, Then sets status to CANCELLED", async () => {
      const entry = { ...mockWaitlistEntry, status: WaitlistStatus.WAITING };
      waitlistRepository.findOne.mockResolvedValue(entry as any);
      waitlistRepository.save.mockResolvedValue({
        ...entry,
        status: WaitlistStatus.CANCELLED,
      } as any);
      const result = await service.leaveWaitlist({
        waitlistId: WAITLIST_ID,
        passengerId: PASSENGER_ID,
      });
      expect(result.status).toBe(WaitlistStatus.CANCELLED);
    });

    it("When entry not found, Then throws WaitlistNotFoundException", async () => {
      waitlistRepository.findOne.mockResolvedValue(null);
      await expect(
        service.leaveWaitlist({
          waitlistId: WAITLIST_ID,
          passengerId: PASSENGER_ID,
        }),
      ).rejects.toThrow(WaitlistNotFoundException);
    });

    it("When entry not in WAITING status, Then throws WaitlistNotFoundException", async () => {
      const entry = { ...mockWaitlistEntry, status: WaitlistStatus.ASSIGNED };
      waitlistRepository.findOne.mockResolvedValue(entry as any);
      await expect(
        service.leaveWaitlist({
          waitlistId: WAITLIST_ID,
          passengerId: PASSENGER_ID,
        }),
      ).rejects.toThrow(WaitlistNotFoundException);
    });
  });

  describe("getFlightWaitlist", () => {
    it("When valid flight, Then returns entries ordered by position", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight);
      const entries = [
        { ...mockWaitlistEntry, position: 1 },
        {
          ...mockWaitlistEntry,
          id: "waitlist-uuid-2",
          passengerId: PASSENGER_ID_2,
          position: 2,
        },
      ];
      waitlistRepository.find.mockResolvedValue(entries as any);
      const result = await service.getFlightWaitlist({ flightId: FLIGHT_ID });
      expect(result).toHaveLength(2);
      expect(result[0].position).toBe(1);
      expect(result[1].position).toBe(2);
    });

    it("When flight not found, Then throws FlightNotFoundException", async () => {
      flightRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getFlightWaitlist({ flightId: FLIGHT_ID }),
      ).rejects.toThrow(FlightNotFoundException);
    });

    it("When no entries, Then returns empty array", async () => {
      flightRepository.findOne.mockResolvedValue(mockFlight);
      waitlistRepository.find.mockResolvedValue([]);
      const result = await service.getFlightWaitlist({ flightId: FLIGHT_ID });
      expect(result).toEqual([]);
    });
  });

  describe("processWaitlist", () => {
    const mockLock = { release: jest.fn() };

    it("When lock acquired and waiting passenger exists, Then assigns seat", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      waitlistRepository.findOne.mockResolvedValue(mockWaitlistEntry as any);
      seatRepository.findOne.mockResolvedValue(mockSeat as any);
      mockManager.update.mockResolvedValue({ affected: 1 });
      mockManager.create.mockReturnValue({} as any);
      mockManager.save.mockResolvedValue({ id: "checkin-uuid-1" } as any);
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockManager),
      );
      await service.processWaitlist({ flightId: FLIGHT_ID, seatId: SEAT_ID });
      expect(redisService.acquireLock).toHaveBeenCalled();
      expect(redisService.setSeatHold).toHaveBeenCalled();
      expect(seatService.invalidateCache).toHaveBeenCalledWith(FLIGHT_ID);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        WAITLIST_NOTIFICATION_EVENT,
        expect.objectContaining({
          passengerId: PASSENGER_ID,
          flightId: FLIGHT_ID,
          seatId: SEAT_ID,
        }),
      );
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When lock cannot be acquired, Then skips processing", async () => {
      redisService.acquireLock.mockRejectedValue(new Error("Lock failed"));
      await service.processWaitlist({ flightId: FLIGHT_ID });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("When no waiting passengers, Then does not assign seat", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      waitlistRepository.findOne.mockResolvedValue(null);
      await service.processWaitlist({ flightId: FLIGHT_ID });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When no available seats, Then does not assign", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      waitlistRepository.findOne.mockResolvedValue(mockWaitlistEntry as any);
      seatRepository.findOne.mockResolvedValue(null);
      await service.processWaitlist({ flightId: FLIGHT_ID });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });

    it("When CAS fails during assignment, Then does not set hold", async () => {
      redisService.acquireLock.mockResolvedValue(mockLock as any);
      waitlistRepository.findOne.mockResolvedValue(mockWaitlistEntry as any);
      seatRepository.findOne.mockResolvedValue(mockSeat as any);
      mockManager.update.mockResolvedValue({ affected: 0 });
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb(mockManager),
      );
      await service.processWaitlist({ flightId: FLIGHT_ID, seatId: SEAT_ID });
      expect(redisService.setSeatHold).not.toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalledWith(mockLock);
    });
  });

  describe("handleWaitlistHoldExpiry", () => {
    it("When assigned entry exists, Then marks as EXPIRED and re-triggers processing", async () => {
      const assignedEntry = {
        ...mockWaitlistEntry,
        status: WaitlistStatus.ASSIGNED,
      };
      waitlistRepository.findOne.mockResolvedValue(assignedEntry as any);
      waitlistRepository.save.mockResolvedValue({
        ...assignedEntry,
        status: WaitlistStatus.EXPIRED,
      } as any);
      await service.handleWaitlistHoldExpiry({
        seatId: SEAT_ID,
        flightId: FLIGHT_ID,
        passengerId: PASSENGER_ID,
      });
      expect(waitlistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.EXPIRED }),
      );
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it("When no assigned entry, Then still triggers processing", async () => {
      waitlistRepository.findOne.mockResolvedValue(null);
      await service.handleWaitlistHoldExpiry({
        seatId: SEAT_ID,
        flightId: FLIGHT_ID,
        passengerId: PASSENGER_ID,
      });
      expect(waitlistRepository.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalled();
    });
  });
});
