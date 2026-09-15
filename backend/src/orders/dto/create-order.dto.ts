import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums.js';

export class CreateOrderDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsString()
  websiteId!: string;

  @IsInt()
  @IsPositive()
  value!: number;

  @IsString()
  product!: string;

  @IsString()
  salesRepId!: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
