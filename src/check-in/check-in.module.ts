import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CheckIn } from "./check-in.entity";
import { Seat } from "../seat/seat.entity";
import { Flight } from "../flight/flight.entity";
import { Waitlist } from "../waitlist/waitlist.entity";
import { CheckInController } from "./check-in.controller";
import { CheckInService } from "./check-in.service";
import { HoldExpiryService } from "./hold-expiry.service";
import { SeatModule } from "../seat/seat.module";
import { BaggageModule } from "../baggage/baggage.module";
import { PaymentModule } from "../payment/payment.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckIn, Seat, Flight, Waitlist]),
    SeatModule,
    BaggageModule,
    PaymentModule,
    AuditModule,
  ],
  controllers: [CheckInController],
  providers: [CheckInService, HoldExpiryService],
  exports: [CheckInService, HoldExpiryService],
})
export class CheckInModule {}
