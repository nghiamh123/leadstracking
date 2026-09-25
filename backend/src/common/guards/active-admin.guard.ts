import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import type { JwtPayload } from '../types/jwt-payload.js';

/**
 * Chỉ cho admin đang hoạt động - đọc role/status từ database mỗi request thay vì tin role trong
 * JWT (sống 12h). Dùng cho dữ liệu nhạy cảm (mật khẩu hosting): admin vừa bị hạ quyền hoặc khoá
 * tài khoản mất quyền ngay, không phải chờ token hết hạn. Đặt sau JwtAuthGuard.
 */
@Injectable()
export class ActiveAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const payload: JwtPayload | undefined = context.switchToHttp().getRequest().user;
    if (!payload?.sub) throw new ForbiddenException();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, status: true },
    });
    if (user?.role !== Role.admin || user.status !== UserStatus.active) {
      throw new ForbiddenException('Chỉ admin mới được truy cập mục Hosting');
    }
    return true;
  }
}
