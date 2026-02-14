import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Waitlist } from "./waitlist.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { CheckIn } from "../check-in/check-in.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";
import { SeatModule } from "../seat/seat.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Waitlist, Seat, Flight, CheckIn, AuditLog]),
    SeatModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
