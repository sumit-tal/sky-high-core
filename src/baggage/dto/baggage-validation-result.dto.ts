/**
 * Result of baggage weight validation and fee calculation.
 */
export class BaggageValidationResultDto {
  readonly weight!: number;
  readonly maxAllowedWeight!: number;
  readonly isOverweight!: boolean;
  readonly excessWeight!: number;
  readonly excessFee!: number;
}
