import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SyncLogsService } from './sync-logs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GscSyncService } from '../gsc/gsc-sync.service.js';

function setup(opts: { log?: unknown; website?: unknown } = {}) {
  const prisma = {
    syncLog: {
      count: vi.fn().mockResolvedValue(45),
      findMany: vi.fn().mockResolvedValue([{ id: 'l1' }]),
      findUnique: vi.fn().mockResolvedValue(opts.log ?? null),
    },
    website: { findUnique: vi.fn().mockResolvedValue(opts.website ?? null) },
  };
  const gscSync = { syncWebsite: vi.fn().mockResolvedValue({ ok: true }) };
  return {
    service: new SyncLogsService(
      prisma as unknown as PrismaService,
      gscSync as unknown as GscSyncService,
    ),
    prisma,
    gscSync,
  };
}

describe('SyncLogsService', () => {
  it('liệt kê có lọc + phân trang, mới nhất trước', async () => {
    const { service, prisma } = setup();
    const res = await service.findAll('w1', 'failed', 2, 20);
    expect(res).toMatchObject({
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
      data: [{ id: 'l1' }],
    });
    expect(prisma.syncLog.findMany).toHaveBeenCalledWith({
      where: { websiteId: 'w1', status: 'failed' },
      orderBy: { runAt: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('chạy lại đồng bộ cho website của log', async () => {
    const { service, gscSync } = setup({ log: { id: 'l1', websiteId: 'w9' } });
    await service.rerun('l1');
    expect(gscSync.syncWebsite).toHaveBeenCalledWith('w9');
  });

  it('chạy lại log không tồn tại → 404', async () => {
    const { service, gscSync } = setup();
    await expect(service.rerun('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(gscSync.syncWebsite).not.toHaveBeenCalled();
  });

  it('đồng bộ ngay: chỉ khi website tồn tại', async () => {
    const ok = setup({ website: { id: 'w1' } });
    await ok.service.syncNow('w1');
    expect(ok.gscSync.syncWebsite).toHaveBeenCalledWith('w1');

    const missing = setup();
    await expect(missing.service.syncNow('w1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
