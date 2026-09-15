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
}
