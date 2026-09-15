import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserStatus, type Role } from '../generated/prisma/enums.js';
import type { InviteUserDto } from './dto/invite-user.dto.js';

// Không bao giờ trả passwordHash ra ngoài API, kể cả cho admin.
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  team: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: PUBLIC_USER_SELECT,
    });
  }

  async invite(dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email này đã có tài khoản trong hệ thống');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        team: dto.team,
        passwordHash,
        status: UserStatus.active,
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async updateRole(id: string, role: Role) {
    await this.assertExists(id);
    return this.prisma.user.update({ where: { id }, data: { role }, select: PUBLIC_USER_SELECT });
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.assertExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: PUBLIC_USER_SELECT,
    });
  }

  /** Admin đặt lại mật khẩu cho người khác (khi họ quên, không cần mật khẩu cũ). */
  async resetPassword(id: string, newPassword: string) {
    await this.assertExists(id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { ok: true };
  }

  private async assertExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }
}
