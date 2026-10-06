import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TicketStatus } from '../../generated/prisma/enums.js';
import { CreateTicketDto } from './create-ticket.dto.js';

export class UpdateTicketDto extends PartialType(CreateTicketDto) {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  /** Chuỗi rỗng = bỏ gán. Chỉ admin được đổi. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  assigneeId?: string;
}
