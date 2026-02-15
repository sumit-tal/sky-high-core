import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { AbuseEvent } from './abuse-event.entity';
import { RecordAbuseEventDto } from './dto';

const DEFAULT_ABUSE_RETENTION_DAYS = 90;

/**
 * Service for recording and managing abuse events.
 * Provides fire-and-forget recording and scheduled cleanup
 * of records older than ABUSE_RETENTION_DAYS.
 */
@Injectable()
export class AbuseEventService {
  private readonly logger = new Logger(AbuseEventService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(AbuseEvent)
    private readonly abuseEventRepository: Repository<AbuseEvent>,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = Number(
      this.configService.get<string>(
        'ABUSE_RETENTION_DAYS',
        String(DEFAULT_ABUSE_RETENTION_DAYS),
      ),
    );
  }

  /**
   * Record an abuse event (non-blocking, fire-and-forget).
   * Errors are caught and logged — abuse recording never blocks the main flow.
   */
  record(dto: RecordAbuseEventDto): void {
    this.abuseEventRepository
      .save(
        this.abuseEventRepository.create({
          sourceIp: dto.sourceIp,
          requestCount: dto.requestCount,
          windowStart: dto.windowStart,
          windowEnd: dto.windowEnd,
          details: dto.details ?? null,
        }),
      )
      .catch((error: Error) => {
        this.logger.error(
          `Failed to record abuse event: ${error.message}`,
          error.stack,
        );
      });
  }

  /**
   * Scheduled cleanup job — runs daily at midnight.
   * Deletes abuse_event records older than ABUSE_RETENTION_DAYS.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldAbuseEvents(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    const result = await this.abuseEventRepository.delete({
      createdAt: LessThan(cutoffDate),
    });
    const deletedCount = result.affected ?? 0;
    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} abuse event(s) older than ${this.retentionDays} days`,
      );
    }
    return deletedCount;
  }
}
