import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GscSyncService } from '../gsc/gsc-sync.service.js';
import type { SyncStatus } from '../generated/prisma/enums.js';

@Injectable()
export class SyncLogsService {
  constructor(
    private prisma: PrismaService,
    private gscSync: GscSyncService,
  ) {}

  findAll(websiteId?: string, status?: SyncStatus) {
    return this.prisma.syncLog.findMany({
      where: { websiteId, status },
      orderBy: { runAt: 'desc' },
      take: 200,
    });
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
