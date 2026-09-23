import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReminderDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
