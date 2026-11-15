import { describe, expect, it, vi } from 'vitest';
import { KeywordsService } from './keywords.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const row = (
  query: string,
  impressions: number,
  clicks: number,
  ctr: number,
  position: number,
) => ({
  websiteId: 'w1',
  website: { id: 'w1', name: 'Gốm Sứ' },
  query,
  impressions,
  clicks,
  ctr,
  position,
  rangeStart: new Date('2026-10-01'),
  rangeEnd: new Date('2026-10-31'),
});

function setup(rows: ReturnType<typeof row>[]) {
  const prisma = { gscKeyword: { findMany: vi.fn().mockResolvedValue(rows) } };
  return {
    service: new KeywordsService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('KeywordsService', () => {
  const rows = [
    row('ly sứ in logo', 1000, 10, 0.01, 8), // nhiều hiển thị, CTR thấp → potential
    row('bình gốm', 200, 50, 0.25, 3), // top 10 + nhiều click → strong
    row('cốc quà tặng', 100, 1, 0.01, 30),
    row('gốm bát tràng', 50, 2, 0.04, 15),
  ];

  it('đổi CTR sang % và gắn nhãn potential/strong theo ngưỡng của chính tập dữ liệu', async () => {
    const { service } = setup(rows);
    const res = await service.findAll({});
    const byQuery = Object.fromEntries(res.data.map((r) => [r.query, r]));
    expect(byQuery['ly sứ in logo']).toMatchObject({
      ctr: 1,
      tag: 'potential',
      websiteName: 'Gốm Sứ',
    });
    expect(byQuery['bình gốm'].tag).toBe('strong');
    expect(byQuery['gốm bát tràng'].tag).toBeNull();
  });

  it('mặc định sắp theo impressions giảm dần', async () => {
    const { service } = setup(rows);
    const res = await service.findAll({});
    expect(res.data.map((r) => r.impressions)).toEqual([1000, 200, 100, 50]);
  });

  it('sắp theo query tăng dần / position', async () => {
    const { service } = setup(rows);
    expect(
      (await service.findAll({ sortBy: 'query', sortDir: 'asc' })).data[0]
        .query,
    ).toBe('bình gốm');
    expect(
      (await service.findAll({ sortBy: 'position', sortDir: 'asc' })).data[0]
        .position,
    ).toBe(3);
  });

  it('phân trang: kẹp page vượt quá về trang cuối, pageSize không hợp lệ dùng 50', async () => {
    const { service } = setup(rows);
    const res = await service.findAll({ page: 9, pageSize: 3 });
    expect(res).toMatchObject({
      total: 4,
      page: 2,
      pageSize: 3,
      totalPages: 2,
    });
    expect(res.data).toHaveLength(1);
    expect(await service.findAll({ page: -1, pageSize: 0 })).toMatchObject({
      page: 1,
      pageSize: 50,
    });
  });

  it('lọc theo website và tìm kiếm không phân biệt hoa thường', async () => {
    const { service, prisma } = setup([]);
    const res = await service.findAll({ websiteId: 'w1', search: 'Gốm' });
    expect(prisma.gscKeyword.findMany.mock.calls[0][0].where).toEqual({
      websiteId: 'w1',
      query: { contains: 'Gốm', mode: 'insensitive' },
    });
    expect(res).toMatchObject({ data: [], total: 0, totalPages: 1 });
  });
});
