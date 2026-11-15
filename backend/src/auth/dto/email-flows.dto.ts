import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ConfirmEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class ResetPasswordWithTokenDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  newPassword!: string;
}

export class NotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  notifyTickets?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyDailyDigest?: boolean;
}
