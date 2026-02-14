import { Test, TestingModule } from '@nestjs/testing';
import { FlightController } from './flight.controller';
import { FlightService } from './flight.service';
import { FlightStatus } from '../common/types/enums';
import { PaginatedFlightsResponseDto, FlightResponseDto } from './dto';

const mockFlightResponse: FlightResponseDto = {
  id: 'flight-uuid-1',
  flightNumber: 'SH-1042',
  departureTime: new Date('2026-02-15T10:00:00Z'),
  status: FlightStatus.SCHEDULED,
  aircraftType: {
    id: 'at-uuid-1',
    name: 'A320',
    rows: 30,
    columns: 'A,B,C,D,E,F',
  },
};

const mockPaginatedResponse: PaginatedFlightsResponseDto = {
  data: [mockFlightResponse],
  meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
};

describe('FlightController', () => {
  let controller: FlightController;
  let service: jest.Mocked<FlightService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlightController],
      providers: [
        {
          provide: FlightService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();
    controller = module.get<FlightController>(FlightController);
    service = module.get(FlightService);
  });

  describe('findAll', () => {
    it('When called with pagination query, Then delegates to service and returns result', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResponse);
      const result = await controller.findAll({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it('When called with custom page and limit, Then passes correct params', async () => {
      service.findAll.mockResolvedValue({ ...mockPaginatedResponse, meta: { page: 2, limit: 5, totalItems: 10, totalPages: 2 } });
      const result = await controller.findAll({ page: 2, limit: 5 });
      expect(service.findAll).toHaveBeenCalledWith({ page: 2, limit: 5 });
      expect(result.meta.page).toBe(2);
    });
  });

  describe('findOne', () => {
    it('When called with valid flightId, Then delegates to service and returns result', async () => {
      service.findOne.mockResolvedValue(mockFlightResponse);
      const result = await controller.findOne('flight-uuid-1');
      expect(result).toEqual(mockFlightResponse);
      expect(service.findOne).toHaveBeenCalledWith('flight-uuid-1');
    });
  });
});
