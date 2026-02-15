import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditLog } from "./audit-log.entity";
import { AbuseEvent } from "./abuse-event.entity";
import { AuditService } from "./audit.service";
import { AbuseEventService } from "./abuse-event.service";

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, AbuseEvent])],
  providers: [AuditService, AbuseEventService],
  exports: [AuditService, AbuseEventService],
})
export class AuditModule {}
