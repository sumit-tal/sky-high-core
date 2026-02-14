import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { CheckInController } from "./check-in.controller";
import { CheckInService } from "./check-in.service";
import { HoldExpiryService } from "./hold-expiry.service";
import { SeatModule } from "../seat/seat.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckIn, Seat, Flight, AuditLog]),
    SeatModule,
  ],
  controllers: [CheckInController],
  providers: [CheckInService, HoldExpiryService],
  exports: [CheckInService, HoldExpiryService],
})
export class CheckInModule {}
