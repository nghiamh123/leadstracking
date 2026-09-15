import { IsOptional, IsString, IsUrl, MinLength, ValidateIf } from 'class-validator';

export class CreateWebsiteDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(3)
  domain!: string;

  @IsString()
  @MinLength(3)
  gscProperty!: string;

  /**
   * Link "Publish to web" (CSV) từ Google Sheet - report dimensions=Date.
   * Chuỗi rỗng hợp lệ khi cập nhật (nghĩa là "xoá link đã cấu hình").
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  trafficCsvUrl?: string;

  /** Link "Publish to web" (CSV) từ Google Sheet - report dimensions=Query. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  keywordsCsvUrl?: string;
}
