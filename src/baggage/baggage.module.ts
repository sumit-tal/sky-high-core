import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BaggageService } from "./baggage.service";

@Module({
  imports: [HttpModule],
  providers: [BaggageService],
  exports: [BaggageService],
})
export class BaggageModule {}
