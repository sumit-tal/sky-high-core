import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Allowed actions for updating a check-in.
 */
export enum CheckInAction {
  CONFIRM = 'CONFIRM',
}

/**
 * Request DTO for updating (confirming) a check-in.
 */
export class UpdateCheckInRequestDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  readonly baggageWeight?: number;

  @IsEnum(CheckInAction)
  readonly action!: CheckInAction;
}
