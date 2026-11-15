import { afterEach, describe, expect, it, vi } from 'vitest';
import { GscSheetsService, type GscRow } from './gsc-sheets.service.js';
import { GscSyncService } from './gsc-sync.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const csv = (text: string) => Buffer.from(text, 'utf-8');

describe('GscSheetsService - parse CSV', () => {
  const sheets = new GscSheetsService();

  it('traffic: số theo locale VN ("3.015" = 3015, "2,7%" = 0.027)', () => {
    const rows = sheets.parseTrafficFile(
      csv(
        'Date,Clicks,Impressions,CTR,Position\n2026-11-01,"3.015","120.400","2,7%","8,4"\n',
      ),
    );
    expect(rows).toEqual([
      {
        date: '2026-11-01',
        clicks: 3015,
        impressions: 120400,
        ctr: expect.any(Number),
        position: 8.4,
      },
    ]);
    expect(rows[0].ctr).toBeCloseTo(0.027, 10);
  });

  it('từ khoá: khớp gần đúng tên cột của export GSC ("Top queries"), thiếu CTR/Position thì = 0', () => {
    const rows = sheets.parseKeywordsFile(
      csv('Top queries,Clicks,Impressions\nly sứ,5,abc\n'),
    );
    expect(rows).toEqual([
      { query: 'ly sứ', clicks: 5, impressions: 0, ctr: 0, position: 0 },
    ]);
  });

  it('thiếu cột bắt buộc → lỗi nêu rõ header đọc được', () => {
    expect(() => sheets.parseTrafficFile(csv('Ngày,Lượt\n1,2\n'))).toThrow(
      /Header đọc được: Ngày, Lượt/,
    );
    expect(() =>
      sheets.parseKeywordsFile(csv('Clicks,Impressions\n1,2\n')),
    ).toThrow(/cần Query/);
  });

  it('file rỗng → lỗi', () => {
    expect(() => sheets.parseTrafficFile(csv('\n\n'))).toThrow(
      'File CSV rỗng.',
    );
  });

  describe('qua link Publish to web', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('tải + parse traffic/từ khoá; testUrl chỉ cần đọc được', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({
            ok: true,
            text: () =>
              Promise.resolve(
                'Query,Clicks,Impressions,CTR,Position\na,1,10,"10%",3\n',
              ),
          }),
      );
      expect(await sheets.fetchKeywords('https://x')).toHaveLength(1);
      await expect(sheets.testUrl('https://x')).resolves.toBeUndefined();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({
            ok: true,
            text: () =>
              Promise.resolve('Date,Clicks,Impressions\n2026-11-01,1,2\n'),
          }),
      );
      expect(await sheets.fetchTraffic('https://x')).toHaveLength(1);
    });

    it('link hết hiệu lực → lỗi kèm mã HTTP', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404 }),
      );
      await expect(sheets.testUrl('https://x')).rejects.toThrow('HTTP 404');
    });
  });
});

function setupSync(website: Record<string, unknown> = {}) {
  const prisma = {
    website: {
      findMany: vi.fn().mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({
          id: 'w1',
          trafficCsvUrl: 'https://t',
          keywordsCsvUrl: 'https://k',
          ...website,
        }),
    },
    gscDailyTraffic: { upsert: vi.fn() },
    gscKeyword: { upsert: vi.fn(), deleteMany: vi.fn() },
    syncLog: { create: vi.fn() },
  };
  const trafficRows: GscRow[] = [
    { date: '2026-11-01', clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    { date: 'not-a-date', clicks: 1, impressions: 2, ctr: 0, position: 0 },
    { clicks: 1, impressions: 2, ctr: 0, position: 0 },
  ];
  const keywordRows: GscRow[] = [
    { query: 'ly sứ', clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    { clicks: 1, impressions: 2, ctr: 0, position: 0 },
  ];
  const sheets = {
    fetchTraffic: vi.fn().mockResolvedValue(trafficRows),
    fetchKeywords: vi.fn().mockResolvedValue(keywordRows),
  };
  const service = new GscSyncService(
    prisma as unknown as PrismaService,
    sheets as unknown as GscSheetsService,
  );
  return { service, prisma, sheets, trafficRows, keywordRows };
}

describe('GscSyncService', () => {
  it('đồng bộ 1 website: upsert traffic (bỏ dòng thiếu/sai ngày), từ khoá, xoá từ khoá cũ, ghi log', async () => {
    const { service, prisma } = setupSync();
    const res = await service.syncWebsite('w1');
    expect(res).toEqual({
      traffic: { ok: true, rows: 3 },
      keywords: { ok: true, rows: 2 },
    });
    expect(prisma.gscDailyTraffic.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.gscKeyword.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.gscKeyword.deleteMany.mock.calls[0][0].where).toMatchObject({
      websiteId: 'w1',
      syncedAt: { lt: expect.any(Date) },
    });
    expect(
      prisma.syncLog.create.mock.calls.map((c) => c[0].data.status),
    ).toEqual(['success', 'success']);
  });

  it('chưa cấu hình link → ghi log failed, không tải', async () => {
    const { service, prisma, sheets } = setupSync({
      trafficCsvUrl: null,
      keywordsCsvUrl: null,
    });
    const res = await service.syncWebsite('w1');
    expect(res.traffic.ok).toBe(false);
    expect(res.keywords.ok).toBe(false);
    expect(sheets.fetchTraffic).not.toHaveBeenCalled();
    expect(
      prisma.syncLog.create.mock.calls.map((c) => c[0].data.status),
    ).toEqual(['failed', 'failed']);
  });

  it('tải CSV lỗi → trả lỗi + ghi log failed (không throw)', async () => {
    const { service, prisma, sheets } = setupSync();
    sheets.fetchTraffic.mockRejectedValue(new Error('HTTP 404'));
    sheets.fetchKeywords.mockRejectedValue(new Error('File CSV rỗng.'));
    const res = await service.syncWebsite('w1');
    expect(res).toEqual({
      traffic: { ok: false, error: 'HTTP 404' },
      keywords: { ok: false, error: 'File CSV rỗng.' },
    });
    expect(prisma.syncLog.create.mock.calls[0][0].data).toMatchObject({
      status: 'failed',
      message: 'HTTP 404',
    });
  });

  it('cron hằng ngày đồng bộ mọi website đã kết nối', async () => {
    const { service, prisma } = setupSync();
    await service.dailySync();
    expect(prisma.website.findMany.mock.calls[0][0].where).toEqual({
      status: 'connected',
    });
    expect(prisma.website.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it('ingest từ nguồn ngoài: thành công ghi log; lỗi DB thì ghi log failed và ném lỗi ra', async () => {
    const { service, prisma, trafficRows, keywordRows } = setupSync();
    expect(await service.ingestTraffic('w1', trafficRows)).toEqual({
      ok: true,
      rows: 3,
    });
    const start = new Date('2026-10-01');
    const end = new Date('2026-10-28');
    expect(await service.ingestKeywords('w1', keywordRows, start, end)).toEqual(
      { ok: true, rows: 2 },
    );
    expect(prisma.gscKeyword.upsert.mock.calls[0][0].create).toMatchObject({
      rangeStart: start,
      rangeEnd: end,
    });

    prisma.gscDailyTraffic.upsert.mockRejectedValue(new Error('db down'));
    prisma.gscKeyword.upsert.mockRejectedValue(new Error('db down'));
    await expect(service.ingestTraffic('w1', trafficRows)).rejects.toThrow(
      'db down',
    );
    await expect(
      service.ingestKeywords('w1', keywordRows, start, end),
    ).rejects.toThrow('db down');
    expect(
      prisma.syncLog.create.mock.calls.slice(-2).map((c) => c[0].data.status),
    ).toEqual(['failed', 'failed']);
  });
});
