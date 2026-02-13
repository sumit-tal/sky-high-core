import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('abuse_event')
@Index('IDX_abuse_event_source_ip_created_at', ['sourceIp', 'createdAt'])
export class AbuseEvent {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'source_ip', type: 'varchar', length: 45 })
  readonly sourceIp!: string;

  @Column({ name: 'request_count', type: 'int' })
  readonly requestCount!: number;

  @Column({ name: 'window_start', type: 'timestamptz' })
  readonly windowStart!: Date;

  @Column({ name: 'window_end', type: 'timestamptz' })
  readonly windowEnd!: Date;

  @Column({ type: 'jsonb', nullable: true })
  readonly details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;
}
