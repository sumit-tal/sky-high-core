/**
 * Response DTO from the external Weight Service stub.
 */
export class WeightServiceResponseDto {
  readonly passengerId!: string;
  readonly weight!: number;
  readonly unit!: string;
  readonly timestamp!: string;
}
