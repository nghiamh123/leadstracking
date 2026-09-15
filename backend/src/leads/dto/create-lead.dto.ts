import { IsDateString, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { LeadChannel, LeadStatus } from '../../generated/prisma/enums.js';

export class CreateLeadDto {
  @IsDateString()
  date!: string;

  @IsString()
  websiteId!: string;

  @IsString()
  @MinLength(2)
  customerName!: string;

  @Matches(/^0\d{9,10}$/, { message: 'SĐT phải bắt đầu bằng 0, đủ 10-11 số' })
  contact!: string;

  @IsEnum(LeadChannel)
  channel!: LeadChannel;

  @IsString()
  interest!: string;

  @IsString()
  salesRepId!: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
