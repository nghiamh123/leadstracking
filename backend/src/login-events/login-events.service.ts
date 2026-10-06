import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPageMeta } from '../common/pagination.js';
import { addDays, fromVnDateTime, startOfTodayVn } from '../common/vn-time.js';
import { IngestLoginEventDto } from './dto/ingest-login-event.dto.js';

const RETENTION_DAYS = 90;
// Từ ngần này lần đăng nhập sai trong 1 giờ trên cùng 1 website + username thì coi là đáng ngờ.
const SUSPICIOUS_FAILS = 5;

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

@Injectable()
export class LoginEventsService {
  constructor(private prisma: PrismaService) {}

  async ingest(dto: IngestLoginEventDto) {
    const domain = normalizeDomain(dto.domain);
    // Domain trong DB có thể được nhập kèm https:// hoặc www., nên so sánh sau khi chuẩn hóa cả hai phía.
    const websites = await this.prisma.website.findMany({ select: { id: true, domain: true } });
    const website = websites.find((w) => normalizeDomain(w.domain) === domain);
    if (!website) {
      throw new NotFoundException(
        `Không tìm thấy website có domain "${dto.domain}". Kiểm tra lại trong Quản trị → Website.`,
      );
    }
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.username.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    const event = await this.prisma.loginEvent.create({
      data: {
        websiteId: website.id,
        username: dto.username.trim(),
        userId: user?.id ?? null,
        success: dto.success,
        ip: dto.ip,
        userAgent: dto.userAgent,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
      select: { id: true },
    });
    return { id: event.id };
  }

  async findAll(filters: {
    websiteId?: string;
    username?: string;
    success?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where = {
      websiteId: filters.websiteId || undefined,
      username: filters.username ? { contains: filters.username, mode: 'insensitive' as const } : undefined,
      success: filters.success === 'true' ? true : filters.success === 'false' ? false : undefined,
      occurredAt:
        filters.from || filters.to
          ? {
              gte: filters.from ? fromVnDateTime(filters.from, '00:00') : undefined,
              // "đến ngày" tính hết ngày đó.
              lt: filters.to ? addDays(fromVnDateTime(filters.to, '00:00'), 1) : undefined,
            }
          : undefined,
    };
    const total = await this.prisma.loginEvent.count({ where });
    const meta = buildPageMeta(total, filters.page, filters.pageSize);
    const data = await this.prisma.loginEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: meta.skip,
      take: meta.pageSize,
      include: { user: { select: { name: true } } },
    });
    return { data, total, page: meta.page, pageSize: meta.pageSize, totalPages: meta.totalPages };
  }

  /** Số liệu tổng quan hôm nay (giờ VN) + các tài khoản đăng nhập sai nhiều lần trong 1 giờ qua. */
  async summary() {
    const since = startOfTodayVn();
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [successToday, failedToday, uniqueUsers, fails] = await Promise.all([
      this.prisma.loginEvent.count({ where: { occurredAt: { gte: since }, success: true } }),
      this.prisma.loginEvent.count({ where: { occurredAt: { gte: since }, success: false } }),
      this.prisma.loginEvent.findMany({
        where: { occurredAt: { gte: since }, success: true },
        distinct: ['username'],
        select: { username: true },
      }),
      this.prisma.loginEvent.groupBy({
        by: ['websiteId', 'username'],
        where: { occurredAt: { gte: hourAgo }, success: false },
        _count: { _all: true },
        having: { username: { _count: { gte: SUSPICIOUS_FAILS } } },
      }),
    ]);
    return {
      successToday,
      failedToday,
      activeUsersToday: uniqueUsers.length,
      suspicious: fails.map((f) => ({
        websiteId: f.websiteId,
        username: f.username,
        failedCount: f._count._all,
      })),
    };
  }

  /** Dọn log cũ hơn 90 ngày, chạy 03:00 hằng ngày. */
  @Cron('0 3 * * *')
  async purgeOld() {
    await this.prisma.loginEvent.deleteMany({
      where: { occurredAt: { lt: addDays(new Date(), -RETENTION_DAYS) } },
    });
  }
}
