import { AuditAction } from '../../common/types/enums';

export interface CreateAuditLogDto {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly fromState: string | null;
  readonly toState: string;
  readonly actorId: string;
  readonly metadata?: Record<string, unknown> | null;
}
