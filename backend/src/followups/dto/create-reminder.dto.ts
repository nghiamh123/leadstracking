import { IsISO8601, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateReminderDto {
  @IsISO8601()
  dueAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}
