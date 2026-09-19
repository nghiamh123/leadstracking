import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GscSyncService } from '../gsc/gsc-sync.service.js';
import { buildPageMeta } from '../common/pagination.js';
import type { SyncStatus } from '../generated/prisma/enums.js';

@Injectable()
export class SyncLogsService {
  constructor(
    private prisma: PrismaService,
    private gscSync: GscSyncService,
  ) {}

  async findAll(websiteId?: string, status?: SyncStatus, page?: number, pageSize?: number) {
    const where = { websiteId, status };
    const total = await this.prisma.syncLog.count({ where });
    const meta = buildPageMeta(total, page, pageSize);
    const data = await this.prisma.syncLog.findMany({
      where,
      orderBy: { runAt: 'desc' },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return { data, total, page: meta.page, pageSize: meta.pageSize, totalPages: meta.totalPages };
  }

  async rerun(id: string) {
    const log = await this.prisma.syncLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Không tìm thấy nhật ký đồng bộ');
    return this.gscSync.syncWebsite(log.websiteId);
  }

  /** Đồng bộ ngay 1 website theo yêu cầu thủ công, không cần đợi cron 02:00 hay có log lỗi sẵn để "Chạy lại". */
  async syncNow(websiteId: string) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Không tìm thấy website');
    return this.gscSync.syncWebsite(websiteId);
  }
}
