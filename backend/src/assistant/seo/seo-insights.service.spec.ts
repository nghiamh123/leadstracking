import { describe, expect, it, vi } from 'vitest';
import {
  clampLimit,
  expectedCtr,
  groupOverlap,
  pctChange,
  previousPeriod,
  rankOpportunities,
  SeoInsightsService,
  summarizeTraffic,
  weeklyBuckets,
  type KeywordRow,
} from './seo-insights.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

function kw(partial: Partial<KeywordRow> & { query: string }): KeywordRow {
  return { websiteName: 'Site A', clicks: 0, impressions: 100, ctr: 0, position: 5, ...partial };
}

describe('helpers', () => {
  it('expectedCtr giảm dần theo vị trí và có mức sàn ngoài top 20', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(3));
    expect(expectedCtr(0.6)).toBe(expectedCtr(1));
    expect(expectedCtr(15)).toBe(0.01);
    expect(expectedCtr(45)).toBe(0.005);
  });

  it('clampLimit dùng mặc định khi thiếu và chặn trần 50', () => {
    expect(clampLimit()).toBe(20);
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit(500)).toBe(50);
    expect(clampLimit(7)).toBe(7);
  });

  it('previousPeriod trả kỳ liền trước cùng độ dài', () => {
    expect(previousPeriod('2026-09-01', '2026-09-30')).toEqual({
      start: '2026-08-02',
      end: '2026-08-31',
    });
    expect(previousPeriod('2026-09-10', '2026-09-10')).toEqual({
      start: '2026-09-09',
      end: '2026-09-09',
    });
  });

  it('pctChange trả null khi kỳ trước bằng 0', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
  });
});

describe('summarizeTraffic / weeklyBuckets', () => {
  const rows = [
    { date: new Date('2026-09-06'), clicks: 10, impressions: 100, position: 4 }, // CN
    { date: new Date('2026-09-07'), clicks: 20, impressions: 300, position: 8 }, // T2
    { date: new Date('2026-09-13'), clicks: 5, impressions: 100, position: 2 }, // CN
  ];

  it('CTR tính trên tổng và vị trí có trọng số theo impression', () => {
    const s = summarizeTraffic(rows);
    expect(s.clicks).toBe(35);
    expect(s.impressions).toBe(500);
    expect(s.ctrPercent).toBe(7);
    expect(s.avgPosition).toBe(6); // (4*100 + 8*300 + 2*100) / 500
    expect(s.daysWithData).toBe(3);
  });

  it('không chia cho 0 khi không có dữ liệu', () => {
    expect(summarizeTraffic([])).toMatchObject({ ctrPercent: 0, avgPosition: null });
  });

  it('gộp theo tuần bắt đầu từ thứ Hai', () => {
    expect(weeklyBuckets(rows)).toEqual([
      { weekStart: '2026-08-31', clicks: 10, impressions: 100, ctrPercent: 10 },
      { weekStart: '2026-09-07', clicks: 25, impressions: 400, ctrPercent: 6.25 },
    ]);
  });
});

describe('rankOpportunities', () => {
  const rows: KeywordRow[] = [
    kw({ query: 'top1', position: 1.2, clicks: 50, impressions: 200, ctr: 0.25 }),
    kw({ query: 'near-a', position: 6, impressions: 400, ctr: 0.01 }),
    kw({ query: 'near-b', position: 12, impressions: 100, ctr: 0 }),
    kw({ query: 'far', position: 35, impressions: 1000, ctr: 0 }),
    kw({ query: 'thin', position: 5, impressions: 3, ctr: 0 }),
    kw({ query: 'low-ctr', position: 2, impressions: 300, ctr: 0.02 }),
  ];

  it('striking_distance: vị trí 4-20, đủ impression, xếp theo click có thể thêm', () => {
    const res = rankOpportunities(rows, 'striking_distance');
    expect(res.map((r) => r.query)).toEqual(['near-a', 'near-b']);
    // 400 * (0.11 - 0.01) = 40
    expect(res[0]).toMatchObject({ estimatedExtraClicks: 40, expectedCtrPercent: 11, ctrPercent: 1 });
  });

  it('low_ctr: CTR dưới một nửa mức kỳ vọng ở vị trí đó', () => {
    const res = rankOpportunities(rows, 'low_ctr');
    expect(res.map((r) => r.query)).toEqual(['low-ctr', 'near-a']);
    // 300 * (0.15 - 0.02) = 39
    expect(res[0]).toMatchObject({ estimatedExtraClicks: 39 });
  });

  it('top_performers: top 5 có click, xếp theo click', () => {
    expect(rankOpportunities(rows, 'top_performers').map((r) => r.query)).toEqual(['top1']);
  });

  it('tôn trọng minImpressions và limit', () => {
    const res = rankOpportunities(rows, 'striking_distance', { minImpressions: 1, limit: 1 });
    expect(res).toHaveLength(1);
    expect(
      rankOpportunities(rows, 'striking_distance', { minImpressions: 1 }).map((r) => r.query),
    ).toContain('thin');
  });
});

describe('groupOverlap', () => {
  it('chỉ giữ keyword có >= 2 website, website xếp theo vị trí', () => {
    const res = groupOverlap([
      { websiteName: 'A', query: 'qua tang', clicks: 1, impressions: 50, position: 9 },
      { websiteName: 'B', query: 'qua tang', clicks: 3, impressions: 80, position: 4 },
      { websiteName: 'A', query: 'binh gom', clicks: 0, impressions: 500, position: 3 },
    ]);
    expect(res).toEqual([
      {
        query: 'qua tang',
        totalImpressions: 130,
        sites: [
          { website: 'B', position: 4, clicks: 3, impressions: 80 },
          { website: 'A', position: 9, clicks: 1, impressions: 50 },
        ],
      },
    ]);
  });
});

describe('SeoInsightsService.trafficTrend', () => {
  it('tách kỳ hiện tại và kỳ trước từ một lần truy vấn', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { date: new Date('2026-09-01'), clicks: 10, impressions: 200, position: 10 },
      { date: new Date('2026-09-02'), clicks: 10, impressions: 200, position: 10 },
      { date: new Date('2026-09-03'), clicks: 30, impressions: 300, position: 5 },
      { date: new Date('2026-09-04'), clicks: 30, impressions: 300, position: 5 },
    ]);
    const service = new SeoInsightsService({
      gscDailyTraffic: { findMany },
    } as unknown as PrismaService);

    const res = await service.trafficTrend({ start: '2026-09-03', end: '2026-09-04' });

    expect(findMany.mock.calls[0][0].where.date).toEqual({
      gte: new Date('2026-09-01'),
      lte: new Date('2026-09-04'),
    });
    expect(res.previousPeriod).toEqual({ start: '2026-09-01', end: '2026-09-02' });
    expect(res.current.clicks).toBe(60);
    expect(res.previous.clicks).toBe(20);
    expect(res.change).toEqual({
      clicksPercent: 200,
      impressionsPercent: 50,
      ctrPoints: 5,
      avgPosition: -5,
    });
    expect(res).toMatchObject({ comparable: true, warning: null });
  });

  it('cảnh báo khi kỳ trước thiếu ngày dữ liệu', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { date: new Date('2026-09-02'), clicks: 10, impressions: 200, position: 10 },
      { date: new Date('2026-09-03'), clicks: 30, impressions: 300, position: 5 },
      { date: new Date('2026-09-04'), clicks: 30, impressions: 300, position: 5 },
    ]);
    const service = new SeoInsightsService({
      gscDailyTraffic: { findMany },
    } as unknown as PrismaService);

    const res = await service.trafficTrend({ start: '2026-09-03', end: '2026-09-04' });

    expect(res.comparable).toBe(false);
    expect(res.warning).toContain('kỳ này 2, kỳ trước 1');
  });
});
