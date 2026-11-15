import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { WebsitesService } from './websites.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GscSheetsService } from '../gsc/gsc-sheets.service.js';
import type { GscSyncService } from '../gsc/gsc-sync.service.js';

const stored = {
  id: 'w1',
  name: 'Gốm Sứ',
  domain: 'gomsu.vn',
  gscProperty: 'sc-domain:gomsu.vn',
  trafficCsvUrl: 'https://t.csv',
  keywordsCsvUrl: 'https://k.csv',
};

function setup(opts: { website?: unknown; probeFails?: boolean } = {}) {
  const prisma = {
    website: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue(opts.website === undefined ? stored : opts.website),
      create: vi.fn(({ data }) => data),
      update: vi.fn(({ data }) => data),
    },
  };
  const gscSheets = {
    testUrl: opts.probeFails
      ? vi.fn().mockRejectedValue(new Error('404'))
      : vi.fn().mockResolvedValue(undefined),
    parseTrafficFile: vi.fn().mockReturnValue([{ date: '2026-11-01' }]),
    parseKeywordsFile: vi.fn().mockReturnValue([{ query: 'a' }]),
  };
  const gscSync = {
    ingestTraffic: vi.fn().mockResolvedValue({ ok: true, rows: 1 }),
    ingestKeywords: vi.fn().mockResolvedValue({ ok: true, rows: 1 }),
  };
  const service = new WebsitesService(
    prisma as unknown as PrismaService,
    gscSheets as unknown as GscSheetsService,
    gscSync as unknown as GscSyncService,
  );
  return { service, prisma, gscSheets, gscSync };
}

const dto = { name: 'Mới', domain: 'moi.vn', gscProperty: 'sc-domain:moi.vn' };

describe('WebsitesService - trạng thái kết nối', () => {
  it('không có link CSV → pending, không thử tải', async () => {
    const { service, gscSheets } = setup();
    expect(await service.create(dto)).toMatchObject({ status: 'pending' });
    expect(gscSheets.testUrl).not.toHaveBeenCalled();
  });

  it('tải được cả 2 link → connected', async () => {
    const { service, gscSheets } = setup();
    expect(
      await service.create({
        ...dto,
        trafficCsvUrl: 'https://t',
        keywordsCsvUrl: 'https://k',
      }),
    ).toMatchObject({
      status: 'connected',
    });
    expect(gscSheets.testUrl).toHaveBeenCalledTimes(2);
  });

  it('link lỗi → error (không throw)', async () => {
    const { service } = setup({ probeFails: true });
    expect(
      await service.create({ ...dto, trafficCsvUrl: 'https://t' }),
    ).toMatchObject({ status: 'error' });
  });
});

describe('WebsitesService.update', () => {
  it('không gửi field = giữ nguyên; gửi chuỗi rỗng = xoá link', async () => {
    const { service, prisma } = setup();
    await service.update('w1', { trafficCsvUrl: '' });
    expect(prisma.website.update.mock.calls[0][0].data).toMatchObject({
      name: 'Gốm Sứ',
      trafficCsvUrl: null,
      keywordsCsvUrl: 'https://k.csv',
      status: 'connected',
    });
  });

  it('cập nhật tên/domain mới', async () => {
    const { service, prisma } = setup();
    await service.update('w1', {
      name: 'Gốm Sứ 2',
      domain: 'gomsu2.vn',
      keywordsCsvUrl: 'https://k2',
    });
    expect(prisma.website.update.mock.calls[0][0].data).toMatchObject({
      name: 'Gốm Sứ 2',
      domain: 'gomsu2.vn',
      keywordsCsvUrl: 'https://k2',
    });
  });

  it('kết nối lại dùng link đang lưu', async () => {
    const { service, gscSheets, prisma } = setup();
    await service.reconnect('w1');
    expect(gscSheets.testUrl.mock.calls.map((c) => c[0])).toEqual([
      'https://t.csv',
      'https://k.csv',
    ]);
    expect(prisma.website.update.mock.calls[0][0]).toEqual({
      where: { id: 'w1' },
      data: { status: 'connected' },
    });
  });

  it.each(['update', 'reconnect', 'uploadGscData'] as const)(
    '%s website không tồn tại → 404',
    async (method) => {
      const { service } = setup({ website: null });
      const call = service[method] as (
        id: string,
        arg: unknown,
      ) => Promise<unknown>;
      await expect(call.call(service, 'x', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );
});

describe('WebsitesService.uploadGscData', () => {
  it('nhập file traffic + từ khoá với khoảng ngày truyền vào, rồi đánh dấu connected', async () => {
    const { service, gscSync, prisma } = setup();
    const res = await service.uploadGscData(
      'w1',
      { traffic: Buffer.from('t'), keywords: Buffer.from('k') },
      { start: '2026-10-01', end: '2026-10-28' },
    );
    expect(res).toEqual({
      traffic: { ok: true, rows: 1 },
      keywords: { ok: true, rows: 1 },
    });
    expect(gscSync.ingestKeywords).toHaveBeenCalledWith(
      'w1',
      [{ query: 'a' }],
      new Date('2026-10-01'),
      new Date('2026-10-28'),
    );
    expect(prisma.website.update.mock.calls[0][0].data).toEqual({
      status: 'connected',
    });
  });

  it('không truyền khoảng ngày: mặc định 28 ngày tới hôm qua', async () => {
    const { service, gscSync } = setup();
    await service.uploadGscData('w1', { keywords: Buffer.from('k') });
    const [, , start, end] = gscSync.ingestKeywords.mock.calls[0];
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(27);
  });

  it('không có file nào thì không đổi trạng thái', async () => {
    const { service, prisma } = setup();
    expect(await service.uploadGscData('w1', {})).toEqual({});
    expect(prisma.website.update).not.toHaveBeenCalled();
  });
});
