import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class IngestLoginEventDto {
  /** Tên miền của website báo về, khớp với Website.domain (vd. "quatangsg.vn"). */
  @IsString()
  @IsNotEmpty()
  domain!: string;

  /** Tên đăng nhập hoặc email dùng để đăng nhập trang admin của website. KHÔNG gửi mật khẩu. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username!: string;

  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  /** Thời điểm đăng nhập (ISO 8601). Bỏ trống thì lấy giờ server nhận. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
