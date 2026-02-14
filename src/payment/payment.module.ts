import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditLog } from "../audit/audit-log.entity";
import { PaymentService } from "./payment.service";

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([AuditLog])],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
