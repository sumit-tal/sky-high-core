import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeatService } from './seat.service';
import { Seat } from './seat.entity';
import { Flight } from '../flight/flight.entity';
import { RedisService } from '../common/redis';
import { FlightNotFoundException } from '../common/filters/exceptions';
import { SeatStatus, FlightStatus } from '../common/types/enums';
import { SeatMapResponseDto } from './dto';

const mockAircraftType = {
  id: 'at-uuid-1',
  name: 'A320',
  rows: 30,
  columns: 'A,B,C,D,E,F',
  flights: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFlight: Flight = {
  id: 'flight-uuid-1',
  flightNumber: 'SH-1042',
  aircraftTypeId: 'at-uuid-1',
  aircraftType: mockAircraftType,
  departureTime: new Date('2026-02-15T10:00:00Z'),
  status: FlightStatus.SCHEDULED,
  seats: [],
  checkIns: [],
  waitlistEntries: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Flight;

const mockSeats: Seat[] = [
  {
    id: 'seat-uuid-1',
    flightId: 'flight-uuid-1',
    row: 1,
    column: 'A',
    status: SeatStatus.AVAILABLE,
    heldBy: null,
    heldAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Seat,
  {
    id: 'seat-uuid-2',
    flightId: 'flight-uuid-1',
    row: 1,
    column: 'B',
    status: SeatStatus.HELD,
    heldBy: 'passenger-uuid-1',
    heldAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Seat,
  {
    id: 'seat-uuid-3',
    flightId: 'flight-uuid-1',
    row: 1,
    column: 'C',
    status: SeatStatus.CONFIRMED,
    heldBy: 'passenger-uuid-2',
    heldAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Seat,
];

const expectedSeatMapResponse: SeatMapResponseDto = {
  flightId: 'flight-uuid-1',
  aircraft: 'A320',
  seats: [
    { id: 'seat-uuid-1', row: 1, column: 'A', status: SeatStatus.AVAILABLE },
    { id: 'seat-uuid-2', row: 1, column: 'B', status: SeatStatus.HELD },
    { id: 'seat-uuid-3', row: 1, column: 'C', status: SeatStatus.CONFIRMED },
  ],
};

describe('SeatService', () => {
  let service: SeatService;
  let seatRepository: jest.Mocked<Repository<Seat>>;
  let flightRepository: jest.Mocked<Repository<Flight>>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatService,
        {
          provide: getRepositoryToken(Seat),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Flight),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getSeatMapCache: jest.fn(),
            setSeatMapCache: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<SeatService>(SeatService);
    seatRepository = module.get(getRepositoryToken(Seat));
    flightRepository = module.get(getRepositoryToken(Flight));
    redisService = module.get(RedisService);
  });

  describe('getSeatMap', () => {
    it('When cache hit, Then returns cached seat map without querying database', async () => {
      redisService.getSeatMapCache.mockResolvedValue(JSON.stringify(expectedSeatMapResponse));
      const result = await service.getSeatMap('flight-uuid-1');
      expect(result).toEqual(expectedSeatMapResponse);
      expect(redisService.getSeatMapCache).toHaveBeenCalledWith('seatmap:flight-uuid-1');
      expect(flightRepository.findOne).not.toHaveBeenCalled();
      expect(seatRepository.find).not.toHaveBeenCalled();
    });

    it('When cache miss, Then queries database and caches result', async () => {
      redisService.getSeatMapCache.mockResolvedValue(null);
      flightRepository.findOne.mockResolvedValue(mockFlight);
      seatRepository.find.mockResolvedValue(mockSeats);
      const result = await service.getSeatMap('flight-uuid-1');
      expect(result).toEqual(expectedSeatMapResponse);
      expect(redisService.getSeatMapCache).toHaveBeenCalledWith('seatmap:flight-uuid-1');
      expect(flightRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'flight-uuid-1' },
        relations: ['aircraftType'],
      });
      expect(seatRepository.find).toHaveBeenCalledWith({
        where: { flightId: 'flight-uuid-1' },
        order: { row: 'ASC', column: 'ASC' },
      });
      expect(redisService.setSeatMapCache).toHaveBeenCalledWith(
        'seatmap:flight-uuid-1',
        JSON.stringify(expectedSeatMapResponse),
      );
    });

    it('When flight does not exist, Then throws FlightNotFoundException', async () => {
      redisService.getSeatMapCache.mockResolvedValue(null);
      flightRepository.findOne.mockResolvedValue(null);
      await expect(service.getSeatMap('non-existent-uuid')).rejects.toThrow(
        FlightNotFoundException,
      );
      expect(seatRepository.find).not.toHaveBeenCalled();
      expect(redisService.setSeatMapCache).not.toHaveBeenCalled();
    });

    it('When flight has no seats, Then returns empty seats array', async () => {
      redisService.getSeatMapCache.mockResolvedValue(null);
      flightRepository.findOne.mockResolvedValue(mockFlight);
      seatRepository.find.mockResolvedValue([]);
      const result = await service.getSeatMap('flight-uuid-1');
      expect(result.flightId).toBe('flight-uuid-1');
      expect(result.aircraft).toBe('A320');
      expect(result.seats).toHaveLength(0);
    });

    it('When cache miss, Then seat response contains correct fields', async () => {
      redisService.getSeatMapCache.mockResolvedValue(null);
      flightRepository.findOne.mockResolvedValue(mockFlight);
      seatRepository.find.mockResolvedValue([mockSeats[0]]);
      const result = await service.getSeatMap('flight-uuid-1');
      expect(result.seats[0]).toEqual({
        id: 'seat-uuid-1',
        row: 1,
        column: 'A',
        status: SeatStatus.AVAILABLE,
      });
    });

    it('When cache miss, Then does not include heldBy or heldAt in response', async () => {
      redisService.getSeatMapCache.mockResolvedValue(null);
      flightRepository.findOne.mockResolvedValue(mockFlight);
      seatRepository.find.mockResolvedValue([mockSeats[1]]);
      const result = await service.getSeatMap('flight-uuid-1');
      const seatKeys = Object.keys(result.seats[0]);
      expect(seatKeys).toEqual(['id', 'row', 'column', 'status']);
      expect(seatKeys).not.toContain('heldBy');
      expect(seatKeys).not.toContain('heldAt');
    });
  });

  describe('invalidateCache', () => {
    it('When called with a flightId, Then deletes the cache key', async () => {
      redisService.del.mockResolvedValue(1);
      await service.invalidateCache('flight-uuid-1');
      expect(redisService.del).toHaveBeenCalledWith('seatmap:flight-uuid-1');
    });

    it('When cache key does not exist, Then del still resolves without error', async () => {
      redisService.del.mockResolvedValue(0);
      await expect(service.invalidateCache('flight-uuid-1')).resolves.toBeUndefined();
    });
  });
});
