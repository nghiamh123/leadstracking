import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class UpdateRoleDto {
  @IsEnum(Role)
  role!: Role;
}
