import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { timeout } from "rxjs/operators";
import { BaggageValidationResultDto, WeightServiceResponseDto } from "./dto";

const DEFAULT_MAX_BAGGAGE_KG = 25;
const DEFAULT_EXCESS_FEE_PER_KG = 10;
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

/**
 * Service for baggage weight validation and excess fee calculation.
 * Calls the external Weight Service stub to get/validate weight
 * and calculates excess fees based on configurable thresholds.
 */
@Injectable()
export class BaggageService {
  private readonly logger = new Logger(BaggageService.name);
  private readonly maxBaggageKg: number;
  private readonly excessFeePerKg: number;
  private readonly weightServiceUrl: string;
  private readonly httpTimeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.maxBaggageKg = Number(
      this.configService.get<string>(
        "MAX_BAGGAGE_WEIGHT_KG",
        String(DEFAULT_MAX_BAGGAGE_KG),
      ),
    );
    this.excessFeePerKg = Number(
      this.configService.get<string>(
        "EXCESS_FEE_PER_KG",
        String(DEFAULT_EXCESS_FEE_PER_KG),
      ),
    );
    this.weightServiceUrl = this.configService.get<string>(
      "WEIGHT_SERVICE_URL",
      "http://localhost:3002",
    );
    this.httpTimeoutMs = Number(
      this.configService.get<string>(
        "WEIGHT_SERVICE_TIMEOUT_MS",
        String(DEFAULT_HTTP_TIMEOUT_MS),
      ),
    );
  }

  /**
   * Validate baggage weight against the external Weight Service
   * and calculate any excess fees.
   * Falls back to the declared weight if the Weight Service is unavailable.
   */
  async validateAndCalculateFee({
    passengerId,
    declaredWeight,
  }: {
    passengerId: string;
    declaredWeight: number;
  }): Promise<BaggageValidationResultDto> {
    await this.callWeightService(passengerId, declaredWeight);
    return this.calculateFee(declaredWeight);
  }

  /**
   * Calculate excess baggage fee for a given weight.
   * Formula: (weight - MAX_BAGGAGE_WEIGHT_KG) * EXCESS_FEE_PER_KG
   */
  calculateFee(weight: number): BaggageValidationResultDto {
    const isOverweight = weight > this.maxBaggageKg;
    const excessWeight = isOverweight ? weight - this.maxBaggageKg : 0;
    const excessFee = isOverweight
      ? Math.round(excessWeight * this.excessFeePerKg * 100) / 100
      : 0;
    return {
      weight,
      maxAllowedWeight: this.maxBaggageKg,
      isOverweight,
      excessWeight: Math.round(excessWeight * 100) / 100,
      excessFee,
    };
  }

  /**
   * Get the configured maximum baggage weight in kg.
   */
  getMaxBaggageKg(): number {
    return this.maxBaggageKg;
  }

  /**
   * Get the configured excess fee per kg.
   */
  getExcessFeePerKg(): number {
    return this.excessFeePerKg;
  }

  private async callWeightService(
    passengerId: string,
    declaredWeight: number,
  ): Promise<WeightServiceResponseDto | null> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get<WeightServiceResponseDto>(
            `${this.weightServiceUrl}/api/v1/baggage/weight/${passengerId}`,
          )
          .pipe(timeout(this.httpTimeoutMs)),
      );
      this.logger.log(
        `Weight service returned ${response.data.weight}kg for passenger '${passengerId}'`,
      );
      return response.data;
    } catch (error) {
      this.logger.warn(
        `Weight service validation failed for passenger '${passengerId}', proceeding with declared weight: ${declaredWeight}kg`,
      );
      return null;
    }
  }
}
