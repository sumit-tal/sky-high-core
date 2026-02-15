import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { AuditService } from "./audit.service";
import { AuditLog } from "./audit-log.entity";
import { AuditAction } from "../common/types/enums";
import { CreateAuditLogDto } from "./dto";

const ENTITY_ID = "entity-uuid-1";
const ACTOR_ID = "actor-uuid-1";

const mockDto: CreateAuditLogDto = {
  entityType: "seat",
  entityId: ENTITY_ID,
  action: AuditAction.SEAT_HELD,
  fromState: "AVAILABLE",
  toState: "HELD",
  actorId: ACTOR_ID,
  metadata: { flightId: "flight-uuid-1" },
};

describe("AuditService", () => {
  let service: AuditService;
  let auditLogRepository: jest.Mocked<Repository<AuditLog>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({ id: "audit-uuid-1" }),
          },
        },
      ],
    }).compile();
    service = module.get<AuditService>(AuditService);
    auditLogRepository = module.get(getRepositoryToken(AuditLog));
  });

  describe("log", () => {
    it("When called with valid dto, Then creates and saves audit log entry", async () => {
      service.log(mockDto);
      await new Promise((resolve) => setImmediate(resolve));
      expect(auditLogRepository.create).toHaveBeenCalledWith({
        entityType: "seat",
        entityId: ENTITY_ID,
        action: AuditAction.SEAT_HELD,
        fromState: "AVAILABLE",
        toState: "HELD",
        actorId: ACTOR_ID,
        metadata: { flightId: "flight-uuid-1" },
      });
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it("When called with null metadata, Then saves with null metadata", async () => {
      const dtoWithNullMeta: CreateAuditLogDto = {
        ...mockDto,
        metadata: null,
      };
      service.log(dtoWithNullMeta);
      await new Promise((resolve) => setImmediate(resolve));
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it("When called without metadata, Then defaults to null", async () => {
      const { metadata, ...dtoWithoutMeta } = mockDto;
      service.log(dtoWithoutMeta as CreateAuditLogDto);
      await new Promise((resolve) => setImmediate(resolve));
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it("When save fails, Then does not throw (fire-and-forget)", async () => {
      auditLogRepository.save.mockRejectedValue(new Error("DB connection lost"));
      expect(() => service.log(mockDto)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });

    it("When called with null fromState, Then saves with null fromState", async () => {
      const dtoWithNullFrom: CreateAuditLogDto = {
        ...mockDto,
        fromState: null,
      };
      service.log(dtoWithNullFrom);
      await new Promise((resolve) => setImmediate(resolve));
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ fromState: null }),
      );
    });
  });

  describe("logWithTransaction", () => {
    it("When called with manager and dto, Then creates and saves via transaction manager", async () => {
      const mockManager = {
        create: jest.fn().mockReturnValue({ id: "audit-uuid-2" }),
        save: jest.fn().mockResolvedValue({ id: "audit-uuid-2" }),
      } as unknown as EntityManager;
      const result = await service.logWithTransaction({
        manager: mockManager,
        dto: mockDto,
      });
      expect(mockManager.create).toHaveBeenCalledWith(AuditLog, {
        entityType: "seat",
        entityId: ENTITY_ID,
        action: AuditAction.SEAT_HELD,
        fromState: "AVAILABLE",
        toState: "HELD",
        actorId: ACTOR_ID,
        metadata: { flightId: "flight-uuid-1" },
      });
      expect(mockManager.save).toHaveBeenCalledWith(AuditLog, { id: "audit-uuid-2" });
      expect(result).toEqual({ id: "audit-uuid-2" });
    });

    it("When manager save fails, Then propagates the error", async () => {
      const mockManager = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockRejectedValue(new Error("Transaction failed")),
      } as unknown as EntityManager;
      await expect(
        service.logWithTransaction({ manager: mockManager, dto: mockDto }),
      ).rejects.toThrow("Transaction failed");
    });

    it("When called without metadata in dto, Then defaults to null", async () => {
      const { metadata, ...dtoWithoutMeta } = mockDto;
      const mockManager = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;
      await service.logWithTransaction({
        manager: mockManager,
        dto: dtoWithoutMeta as CreateAuditLogDto,
      });
      expect(mockManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ metadata: null }),
      );
    });
  });
});
