import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadActivityType } from '../../generated/prisma/enums.js';

export class CreateActivityDto {
  @IsIn(Object.values(LeadActivityType))
  type!: LeadActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Bỏ trống = bây giờ. */
  @IsOptional()
  @IsISO8601()
  happenedAt?: string;
}
