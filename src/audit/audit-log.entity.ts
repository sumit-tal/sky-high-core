import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../common/types/enums';

@Entity('audit_log')
@Index('IDX_audit_log_entity', ['entityType', 'entityId'])
@Index('IDX_audit_log_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  readonly entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  readonly entityId!: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  readonly action!: AuditAction;

  @Column({ name: 'from_state', type: 'varchar', length: 50, nullable: true })
  readonly fromState!: string | null;

  @Column({ name: 'to_state', type: 'varchar', length: 50 })
  readonly toState!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  readonly actorId!: string;

  @Column({ type: 'jsonb', nullable: true })
  readonly metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;
}
