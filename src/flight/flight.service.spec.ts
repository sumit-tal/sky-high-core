import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FlightService } from "./flight.service";
import { Flight } from "./flight.entity";
import { FlightNotFoundException } from "../common/filters/exceptions";
import { FlightStatus } from "../common/types/enums";

const mockAircraftType = {
  id: "at-uuid-1",
  name: "A320",
  rows: 30,
  columns: "A,B,C,D,E,F",
  flights: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFlight: Flight = {
  id: "flight-uuid-1",
  flightNumber: "SH-1042",
  aircraftTypeId: "at-uuid-1",
  aircraftType: mockAircraftType,
  departureTime: new Date("2026-02-15T10:00:00Z"),
  status: FlightStatus.SCHEDULED,
  seats: [],
  checkIns: [],
  waitlistEntries: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Flight;

const mockFlightTwo: Flight = {
  id: "flight-uuid-2",
  flightNumber: "SH-2085",
  aircraftTypeId: "at-uuid-1",
  aircraftType: mockAircraftType,
  departureTime: new Date("2026-02-16T10:00:00Z"),
  status: FlightStatus.SCHEDULED,
  seats: [],
  checkIns: [],
  waitlistEntries: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Flight;

describe("FlightService", () => {
  let service: FlightService;
  let repository: jest.Mocked<Repository<Flight>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlightService,
        {
          provide: getRepositoryToken(Flight),
          useValue: {
            findAndCount: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<FlightService>(FlightService);
    repository = module.get(getRepositoryToken(Flight));
  });

  describe("findAll", () => {
    it("When requesting page 1 with limit 10, Then returns paginated flights", async () => {
      repository.findAndCount.mockResolvedValue([
        [mockFlight, mockFlightTwo],
        2,
      ]);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        totalItems: 2,
        totalPages: 1,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({
        relations: ["aircraftType"],
        order: { departureTime: "ASC" },
        skip: 0,
        take: 10,
      });
    });

    it("When requesting page 2 with limit 1, Then returns correct pagination meta", async () => {
      repository.findAndCount.mockResolvedValue([[mockFlightTwo], 2]);
      const result = await service.findAll({ page: 2, limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 2,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({
        relations: ["aircraftType"],
        order: { departureTime: "ASC" },
        skip: 1,
        take: 1,
      });
    });

    it("When no flights exist, Then returns empty data with zero totals", async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it("When flights are returned, Then maps aircraft type correctly", async () => {
      repository.findAndCount.mockResolvedValue([[mockFlight], 1]);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].aircraftType).toEqual({
        id: "at-uuid-1",
        name: "A320",
        rows: 30,
        columns: "A,B,C,D,E,F",
      });
    });
  });

  describe("findOne", () => {
    it("When flight exists, Then returns flight with aircraft type", async () => {
      repository.findOne.mockResolvedValue(mockFlight);
      const result = await service.findOne("flight-uuid-1");
      expect(result.id).toBe("flight-uuid-1");
      expect(result.flightNumber).toBe("SH-1042");
      expect(result.aircraftType.name).toBe("A320");
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "flight-uuid-1" },
        relations: ["aircraftType"],
      });
    });

    it("When flight does not exist, Then throws FlightNotFoundException", async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findOne("non-existent-uuid")).rejects.toThrow(
        FlightNotFoundException,
      );
    });

    it("When flight is returned, Then response contains correct fields", async () => {
      repository.findOne.mockResolvedValue(mockFlight);
      const result = await service.findOne("flight-uuid-1");
      expect(result).toEqual({
        id: "flight-uuid-1",
        flightNumber: "SH-1042",
        departureTime: mockFlight.departureTime,
        status: FlightStatus.SCHEDULED,
        aircraftType: {
          id: "at-uuid-1",
          name: "A320",
          rows: 30,
          columns: "A,B,C,D,E,F",
        },
      });
    });
  });
});
