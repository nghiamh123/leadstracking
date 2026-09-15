import { Role } from '../generated/prisma/enums.js';
import type { JwtPayload } from './types/jwt-payload.js';

/**
 * Phạm vi truy cập Lead/Order theo vai trò (mục 6 tài liệu yêu cầu):
 * - admin: xem/sửa tất cả
 * - manager: xem/sửa lead-order của Sales cùng team
 * - sales: chỉ xem/sửa lead-order do chính mình phụ trách
 * Endpoint gọi hàm này phải tự chặn role `seo` bằng RolesGuard trước khi tới đây.
 */
export function leadOrderScope(user: JwtPayload): Record<string, unknown> {
  if (user.role === Role.sales) {
    return { salesRepId: user.sub };
  }
  if (user.role === Role.manager) {
    return user.team ? { salesRep: { team: user.team } } : { salesRepId: user.sub };
  }
  return {};
}
