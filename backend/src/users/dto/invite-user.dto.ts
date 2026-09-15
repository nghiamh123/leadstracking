import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class InviteUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  team?: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu ban đầu phải có ít nhất 8 ký tự' })
  password!: string;
}
