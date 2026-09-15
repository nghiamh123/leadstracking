import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GscTrafficRowDto {
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(0)
  clicks!: number;

  @IsInt()
  @Min(0)
  impressions!: number;

  /** Tỉ lệ 0-1 (giống format trả về từ Search Console API), không phải phần trăm. */
  @IsNumber()
  @Min(0)
  ctr!: number;

  @IsNumber()
  @Min(0)
  position!: number;
}

export class GscKeywordRowDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsInt()
  @Min(0)
  clicks!: number;

  @IsInt()
  @Min(0)
  impressions!: number;

  @IsNumber()
  @Min(0)
  ctr!: number;

  @IsNumber()
  @Min(0)
  position!: number;
}

export class IngestGscDto {
  /** Phải khớp chính xác với cột gsc_property của website trong app. */
  @IsString()
  @IsNotEmpty()
  siteUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GscTrafficRowDto)
  traffic?: GscTrafficRowDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GscKeywordRowDto)
  keywords?: GscKeywordRowDto[];

  @IsOptional()
  @IsDateString()
  keywordsRangeStart?: string;

  @IsOptional()
  @IsDateString()
  keywordsRangeEnd?: string;
}
