import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { CreateAuditLogDto } from './dto';

/**
 * Centralized audit logging service.
 * Provides both fire-and-forget (non-blocking) and transactional audit log creation.
 * All state transitions are recorded in the append-only audit_log table.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Create an audit log entry (non-blocking, fire-and-forget).
   * Errors are caught and logged — audit failures never block the main flow.
   */
  log(dto: CreateAuditLogDto): void {
    this.auditLogRepository
      .save(
        this.auditLogRepository.create({
          entityType: dto.entityType,
          entityId: dto.entityId,
          action: dto.action,
          fromState: dto.fromState,
          toState: dto.toState,
          actorId: dto.actorId,
          metadata: dto.metadata ?? null,
        }),
      )
      .catch((error: Error) => {
        this.logger.error(
          `Failed to create audit log: ${error.message}`,
          error.stack,
        );
      });
  }

  /**
   * Create an audit log entry within an existing transaction.
   * Used when audit logging must be atomic with the state transition.
   */
  async logWithTransaction({
    manager,
    dto,
  }: {
    manager: EntityManager;
    dto: CreateAuditLogDto;
  }): Promise<AuditLog> {
    const auditLog = manager.create(AuditLog, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      action: dto.action,
      fromState: dto.fromState,
      toState: dto.toState,
      actorId: dto.actorId,
      metadata: dto.metadata ?? null,
    });
    return manager.save(AuditLog, auditLog);
  }
}
