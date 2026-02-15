import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PaymentService } from "./payment.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [HttpModule, AuditModule],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
