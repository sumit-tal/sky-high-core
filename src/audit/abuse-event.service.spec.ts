import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { AbuseEventService } from "./abuse-event.service";
import { AbuseEvent } from "./abuse-event.entity";
import { RecordAbuseEventDto } from "./dto";

const MOCK_IP = "192.168.1.100";

const mockDto: RecordAbuseEventDto = {
  sourceIp: MOCK_IP,
  requestCount: 55,
  windowStart: new Date("2026-02-14T15:00:00Z"),
  windowEnd: new Date("2026-02-14T15:00:02Z"),
  details: { endpoint: "/api/v1/flights/abc/seats" },
};

describe("AbuseEventService", () => {
  let service: AbuseEventService;
  let abuseEventRepository: jest.Mocked<Repository<AbuseEvent>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbuseEventService,
        {
          provide: getRepositoryToken(AbuseEvent),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({ id: "abuse-uuid-1" }),
            delete: jest.fn().mockResolvedValue({ affected: 0 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => {
              if (key === "ABUSE_RETENTION_DAYS") return "90";
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();
    service = module.get<AbuseEventService>(AbuseEventService);
    abuseEventRepository = module.get(getRepositoryToken(AbuseEvent));
  });

  describe("record", () => {
    it("When called with valid dto, Then creates and saves abuse event", async () => {
      service.record(mockDto);
      await new Promise((resolve) => setImmediate(resolve));
      expect(abuseEventRepository.create).toHaveBeenCalledWith({
        sourceIp: MOCK_IP,
        requestCount: 55,
        windowStart: mockDto.windowStart,
        windowEnd: mockDto.windowEnd,
        details: { endpoint: "/api/v1/flights/abc/seats" },
      });
      expect(abuseEventRepository.save).toHaveBeenCalled();
    });

    it("When called with null details, Then saves with null details", async () => {
      const dtoWithNullDetails: RecordAbuseEventDto = {
        ...mockDto,
        details: null,
      };
      service.record(dtoWithNullDetails);
      await new Promise((resolve) => setImmediate(resolve));
      expect(abuseEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ details: null }),
      );
    });

    it("When called without details, Then defaults to null", async () => {
      const { details, ...dtoWithoutDetails } = mockDto;
      service.record(dtoWithoutDetails as RecordAbuseEventDto);
      await new Promise((resolve) => setImmediate(resolve));
      expect(abuseEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ details: null }),
      );
    });

    it("When save fails, Then does not throw (fire-and-forget)", async () => {
      abuseEventRepository.save.mockRejectedValue(
        new Error("DB connection lost"),
      );
      expect(() => service.record(mockDto)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe("cleanupOldAbuseEvents", () => {
    it("When old records exist, Then deletes them and returns count", async () => {
      abuseEventRepository.delete.mockResolvedValue({ affected: 5, raw: [] });
      const result = await service.cleanupOldAbuseEvents();
      expect(result).toBe(5);
      expect(abuseEventRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: expect.anything(),
        }),
      );
    });

    it("When no old records exist, Then returns zero", async () => {
      abuseEventRepository.delete.mockResolvedValue({ affected: 0, raw: [] });
      const result = await service.cleanupOldAbuseEvents();
      expect(result).toBe(0);
    });

    it("When cleanup runs, Then uses configured retention days for cutoff", async () => {
      abuseEventRepository.delete.mockResolvedValue({ affected: 3, raw: [] });
      const beforeCall = new Date();
      beforeCall.setDate(beforeCall.getDate() - 90);
      await service.cleanupOldAbuseEvents();
      const deleteArg = abuseEventRepository.delete.mock.calls[0][0] as any;
      const cutoffValue = deleteArg.createdAt._value;
      expect(cutoffValue.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime() - 1000,
      );
      expect(cutoffValue.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("When affected is undefined, Then returns zero", async () => {
      abuseEventRepository.delete.mockResolvedValue({
        affected: undefined,
        raw: [],
      } as any);
      const result = await service.cleanupOldAbuseEvents();
      expect(result).toBe(0);
    });
  });
});
