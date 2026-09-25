import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateHostingDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsUrl({ require_protocol: true, require_tld: false }, { message: 'Link hosting phải là URL đầy đủ (https://...)' })
  loginUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;

  /** Khi cập nhật: không gửi = giữ nguyên, chuỗi rỗng = xoá mật khẩu đã lưu. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
