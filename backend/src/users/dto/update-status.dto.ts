import { IsEnum } from 'class-validator';
import { UserStatus } from '../../generated/prisma/enums.js';

export class UpdateStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
