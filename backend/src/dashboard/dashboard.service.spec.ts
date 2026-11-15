import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const sales: JwtPayload = {
  sub: 'rep1',
  email: 's@x.vn',
  role: 'sales',
  team: null,
};
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function setup() {
  const prisma = {
    gscDailyTraffic: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { clicks: 200 } }),
      findMany: vi.fn().mockResolvedValue([
        { websiteId: 'w1', date: d('2026-11-01'), clicks: 10 },
        { websiteId: 'w2', date: d('2026-11-01'), clicks: 5 },
        { websiteId: 'w1', date: d('2026-11-03'), clicks: 7 },
      ]),
    },
    lead: {
      count: vi.fn().mockResolvedValue(20),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { date: d('2026-11-01') },
          { date: d('2026-11-01') },
          { date: d('2026-11-02') },
        ]),
    },
    order: {
      count: vi.fn().mockResolvedValue(5),
      findMany: vi.fn().mockResolvedValue([{ date: d('2026-11-02') }]),
    },
    website: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'w1', name: 'A', domain: 'a.vn' },
        { id: 'w2', name: 'B', domain: 'b.vn' },
      ]),
    },
  };
  return {
    service: new DashboardService(prisma as unknown as PrismaService),
    prisma,
  };
}

const range = { start: '2026-11-01', end: '2026-11-03' };

describe('DashboardService', () => {
  it('summary: tổng click + lead/đơn trong phạm vi của người xem', async () => {
    const { service, prisma } = setup();
    expect(
      await service.summary(sales, {
        ...range,
        websiteId: 'w1',
        salesRepId: 'rep1',
      }),
    ).toEqual({
      clicks: 200,
      leadCount: 20,
      orderCount: 5,
    });
    const and = prisma.lead.count.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({ salesRepId: 'rep1' });
    expect(and).toContainEqual({ websiteId: 'w1' });
  });

  it('summary: chưa có traffic thì click = 0', async () => {
    const { service, prisma } = setup();
    prisma.gscDailyTraffic.aggregate.mockResolvedValue({
      _sum: { clicks: null },
    });
    expect((await service.summary(sales, range)).clicks).toBe(0);
  });

  it('trend: đủ mọi ngày trong khoảng, gom theo ngày', async () => {
    const { service } = setup();
    expect(
      await service.trend(sales, {
        ...range,
        websiteId: 'w1',
        salesRepId: 'rep1',
      }),
    ).toEqual([
      { date: '2026-11-01', clicks: 15, leads: 2, orders: 0 },
      { date: '2026-11-02', clicks: 0, leads: 1, orders: 1 },
      { date: '2026-11-03', clicks: 7, leads: 0, orders: 0 },
    ]);
  });

  it('trendByWebsite: mỗi website 1 cột theo ngày', async () => {
    const { service } = setup();
    const res = await service.trendByWebsite(range);
    expect(res.websites).toEqual([
      { id: 'w1', name: 'A', domain: 'a.vn' },
      { id: 'w2', name: 'B', domain: 'b.vn' },
    ]);
    expect(res.data[0]).toEqual({ date: '2026-11-01', w1: 10, w2: 5 });
    expect(res.data[2]).toEqual({ date: '2026-11-03', w1: 7, w2: 0 });
  });

  it('byWebsite: gom nhóm theo website (không N+1), tỉ lệ chuyển đổi, chia cho 0 thì = 0', async () => {
    const { service, prisma } = setup();
    const groupBy = (rows: unknown[]) => vi.fn().mockResolvedValue(rows);
    Object.assign(prisma.gscDailyTraffic, { groupBy: groupBy([{ websiteId: 'w1', _sum: { clicks: 200 } }]) });
    Object.assign(prisma.lead, { groupBy: groupBy([{ websiteId: 'w1', _count: { _all: 20 } }]) });
    Object.assign(prisma.order, { groupBy: groupBy([{ websiteId: 'w1', _count: { _all: 5 } }]) });
    const [a, b] = await service.byWebsite(sales, range);
    expect(prisma.lead.count).not.toHaveBeenCalled();
    expect(a).toEqual({
      websiteId: 'w1',
      websiteName: 'A',
      clicks: 200,
      leadCount: 20,
      orderCount: 5,
      leadRate: 10,
      orderRate: 25,
      totalRate: 2.5,
    });
    expect(b).toMatchObject({ clicks: 0, leadCount: 0, orderCount: 0, leadRate: 0, orderRate: 0, totalRate: 0 });
  });

  it('overview: 1 request gồm kỳ này + kỳ trước; chỉ tính biểu đồ đang hiển thị', async () => {
    const { service, prisma } = setup();
    for (const model of [prisma.gscDailyTraffic, prisma.lead, prisma.order]) {
      Object.assign(model, { groupBy: vi.fn().mockResolvedValue([]) });
    }
    const all = await service.overview(sales, { ...range, prevStart: '2026-10-29', prevEnd: '2026-10-31' });
    expect(all.trend).toBeNull();
    expect(all.trendByWebsite?.data).toHaveLength(3);
    expect(all.previous).toEqual({ clicks: 200, leadCount: 20, orderCount: 5 });
    expect(all.byWebsite).toHaveLength(2);

    const one = await service.overview(sales, { ...range, websiteId: 'w1', prevStart: '2026-10-29', prevEnd: '2026-10-31' });
    expect(one.trendByWebsite).toBeNull();
    expect(one.trend).toHaveLength(3);
  });
});
