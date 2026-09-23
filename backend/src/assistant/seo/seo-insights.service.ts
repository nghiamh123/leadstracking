import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Các truy vấn phân tích SEO mà Trợ lý AI (persona SEO) gọi qua tool.
 * Mọi hàm chỉ đọc, trả JSON gọn (đã làm tròn, giới hạn số dòng) để model
 * không bị ngợp dữ liệu và tốn ít token.
 */

export type OpportunityType = 'striking_distance' | 'low_ctr' | 'top_performers';

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;
/** Dữ liệu thật còn mỏng (trung vị ~4 impression/keyword) nên ngưỡng mặc định để thấp. */
export const DEFAULT_MIN_IMPRESSIONS = 10;
/** Keyword bị coi là "CTR thấp" khi CTR thực tế < tỉ lệ này × CTR kỳ vọng ở vị trí đó. */
const LOW_CTR_RATIO = 0.5;

/**
 * CTR kỳ vọng (0-1) theo vị trí 1..10 trên Google - số liệu tham khảo chung của ngành,
 * cần hiệu chỉnh lại khi có đủ dữ liệu thật của 12 website.
 */
const EXPECTED_CTR_TOP10 = [0.28, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02];

export function expectedCtr(position: number): number {
  const rank = Math.max(1, Math.round(position));
  if (rank <= 10) return EXPECTED_CTR_TOP10[rank - 1];
  if (rank <= 20) return 0.01;
  return 0.005;
}

export function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
}

/** Kỳ liền trước, cùng độ dài với [start, end]. */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(daysBetween(start, end) - 1)), end: prevEnd };
}

/** % thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không so được). */
export function pctChange(current: number, previous: number): number | null {
  return previous === 0 ? null : round(((current - previous) / previous) * 100);
}

export interface TrafficRow {
  date: Date;
  clicks: number;
  impressions: number;
  position: number;
}

export function summarizeTraffic(rows: TrafficRow[]) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Vị trí trung bình có trọng số theo impression, giống cách GSC tính khi gộp nhiều ngày.
  const weightedPos = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctrPercent: impressions === 0 ? 0 : round((clicks / impressions) * 100, 2),
    avgPosition: impressions === 0 ? null : round(weightedPos / impressions),
    daysWithData: new Set(rows.map((r) => toDateStr(r.date))).size,
  };
}

/** Gộp theo tuần (bắt đầu từ thứ Hai) để trả chuỗi ngắn gọn thay vì từng ngày. */
export function weeklyBuckets(rows: TrafficRow[]) {
  const buckets = new Map<string, TrafficRow[]>();
  for (const r of rows) {
    const d = new Date(r.date);
    const offsetToMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offsetToMonday);
    const key = toDateStr(d);
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekRows]) => {
      const s = summarizeTraffic(weekRows);
      return { weekStart, clicks: s.clicks, impressions: s.impressions, ctrPercent: s.ctrPercent };
    });
}

export interface KeywordRow {
  websiteName: string;
  query: string;
  clicks: number;
  impressions: number;
  /** Tỉ lệ 0-1, đúng như lưu trong DB. */
  ctr: number;
  position: number;
}

function formatKeyword(r: KeywordRow) {
  return {
    website: r.websiteName,
    query: r.query,
    clicks: r.clicks,
    impressions: r.impressions,
    ctrPercent: round(r.ctr * 100, 2),
    position: round(r.position),
  };
}

export function rankOpportunities(
  rows: KeywordRow[],
  type: OpportunityType,
  opts: { minImpressions?: number; limit?: number } = {},
) {
  const minImpressions = opts.minImpressions ?? DEFAULT_MIN_IMPRESSIONS;
  const limit = clampLimit(opts.limit);

  if (type === 'top_performers') {
    return rows
      .filter((r) => r.position <= 5 && r.clicks > 0)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, limit)
      .map(formatKeyword);
  }

  const candidates =
    type === 'striking_distance'
      ? rows
          .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= minImpressions)
          // Nếu lên được top 3 thì kỳ vọng CTR ~ CTR vị trí 3.
          .map((r) => ({ r, target: expectedCtr(3) }))
      : rows
          .filter(
            (r) =>
              r.position <= 10 &&
              r.impressions >= minImpressions &&
              r.ctr < expectedCtr(r.position) * LOW_CTR_RATIO,
          )
          .map((r) => ({ r, target: expectedCtr(r.position) }));

  return candidates
    .map(({ r, target }) => ({
      ...formatKeyword(r),
      expectedCtrPercent: round(target * 100, 2),
      estimatedExtraClicks: Math.round(r.impressions * Math.max(0, target - r.ctr)),
    }))
    .sort((a, b) => b.estimatedExtraClicks - a.estimatedExtraClicks || b.impressions - a.impressions)
    .slice(0, limit);
}

export interface OverlapRow {
  websiteName: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** Gom các keyword mà >= 2 website của công ty cùng xuất hiện (tự cạnh tranh nhau). */
export function groupOverlap(rows: OverlapRow[], limit?: number) {
  const byQuery = new Map<string, OverlapRow[]>();
  for (const r of rows) byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);

  return [...byQuery.entries()]
    .filter(([, sites]) => sites.length >= 2)
    .map(([query, sites]) => ({
      query,
      totalImpressions: sites.reduce((s, x) => s + x.impressions, 0),
      sites: sites
        .sort((a, b) => a.position - b.position)
        .map((x) => ({
          website: x.websiteName,
          position: round(x.position),
          clicks: x.clicks,
          impressions: x.impressions,
        })),
    }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, clampLimit(limit));
}

@Injectable()
export class SeoInsightsService {
  constructor(private prisma: PrismaService) {}

  /** Danh sách website kèm độ mới của dữ liệu - để bot luôn ghi rõ "số liệu tính đến ngày X". */
  async listWebsites() {
    const [websites, trafficMax, keywordStats, lastSyncs] = await Promise.all([
      this.prisma.website.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.gscDailyTraffic.groupBy({ by: ['websiteId'], _max: { date: true } }),
      this.prisma.gscKeyword.groupBy({
        by: ['websiteId'],
        _count: { _all: true },
        _min: { rangeStart: true },
        _max: { rangeEnd: true },
      }),
      this.prisma.syncLog.findMany({
        distinct: ['websiteId', 'scope'],
        orderBy: { runAt: 'desc' },
        select: { websiteId: true, scope: true, status: true, runAt: true },
      }),
    ]);

    return websites.map((w) => {
      const traffic = trafficMax.find((t) => t.websiteId === w.id);
      const kw = keywordStats.find((k) => k.websiteId === w.id);
      const syncOf = (scope: 'traffic' | 'keywords') => {
        const log = lastSyncs.find((l) => l.websiteId === w.id && l.scope === scope);
        return log ? { status: log.status, runAt: log.runAt.toISOString() } : null;
      };
      return {
        id: w.id,
        name: w.name,
        domain: w.domain,
        status: w.status,
        trafficDataThrough: traffic?._max.date ? toDateStr(traffic._max.date) : null,
        keywordCount: kw?._count._all ?? 0,
        keywordRange:
          kw?._min.rangeStart && kw._max.rangeEnd
            ? { start: toDateStr(kw._min.rangeStart), end: toDateStr(kw._max.rangeEnd) }
            : null,
        lastSync: { traffic: syncOf('traffic'), keywords: syncOf('keywords') },
      };
    });
  }

  /** Traffic kỳ [start, end] so với kỳ liền trước cùng độ dài. Ngày dạng YYYY-MM-DD. */
  async trafficTrend(params: { websiteId?: string; start: string; end: string }) {
    const prev = previousPeriod(params.start, params.end);
    const rows = await this.prisma.gscDailyTraffic.findMany({
      where: {
        websiteId: params.websiteId,
        date: { gte: new Date(prev.start), lte: new Date(params.end) },
      },
      select: { date: true, clicks: true, impressions: true, position: true },
    });

    const inCurrent = (r: TrafficRow) => toDateStr(r.date) >= params.start;
    const currentRows = rows.filter(inCurrent);
    const current = summarizeTraffic(currentRows);
    const previous = summarizeTraffic(rows.filter((r) => !inCurrent(r)));

    // Kỳ trước thiếu ngày dữ liệu (vd: mới bắt đầu sync) thì % thay đổi sẽ bị thổi phồng -
    // báo rõ để model không kết luận "traffic tăng gấp đôi".
    const comparable = current.daysWithData === previous.daysWithData;

    return {
      period: { start: params.start, end: params.end },
      previousPeriod: prev,
      current,
      previous,
      comparable,
      warning: comparable
        ? null
        : `Số ngày có dữ liệu không bằng nhau (kỳ này ${current.daysWithData}, kỳ trước ${previous.daysWithData}) - % thay đổi không đáng tin.`,
      change: {
        clicksPercent: pctChange(current.clicks, previous.clicks),
        impressionsPercent: pctChange(current.impressions, previous.impressions),
        ctrPoints: round(current.ctrPercent - previous.ctrPercent, 2),
        // Vị trí giảm (số nhỏ hơn) là tốt lên, nên để dấu âm = cải thiện.
        avgPosition:
          current.avgPosition !== null && previous.avgPosition !== null
            ? round(current.avgPosition - previous.avgPosition)
            : null,
      },
      weekly: weeklyBuckets(currentRows),
    };
  }

  async keywordOpportunities(params: {
    websiteId?: string;
    type: OpportunityType;
    minImpressions?: number;
    limit?: number;
  }) {
    const rows = await this.loadKeywords(params.websiteId);
    return rankOpportunities(rows, params.type, params);
  }

  async searchKeywords(params: { contains: string; websiteId?: string; limit?: number }) {
    const rows = await this.prisma.gscKeyword.findMany({
      where: {
        websiteId: params.websiteId,
        query: { contains: params.contains, mode: 'insensitive' },
      },
      include: { website: { select: { name: true } } },
      orderBy: { impressions: 'desc' },
      take: clampLimit(params.limit),
    });
    return rows.map((r) => formatKeyword({ ...r, websiteName: r.website.name }));
  }

  async crossSiteOverlap(params: { limit?: number } = {}) {
    // Khoá duy nhất (website, query) nên số dòng mỗi query = số website cùng có keyword đó.
    const shared = await this.prisma.gscKeyword.groupBy({
      by: ['query'],
      having: { query: { _count: { gt: 1 } } },
    });
    if (shared.length === 0) return [];

    const rows = await this.prisma.gscKeyword.findMany({
      where: { query: { in: shared.map((s) => s.query) } },
      include: { website: { select: { name: true } } },
    });
    return groupOverlap(
      rows.map((r) => ({ ...r, websiteName: r.website.name })),
      params.limit,
    );
  }

  private async loadKeywords(websiteId?: string): Promise<KeywordRow[]> {
    const rows = await this.prisma.gscKeyword.findMany({
      where: { websiteId },
      include: { website: { select: { name: true } } },
    });
    return rows.map((r) => ({ ...r, websiteName: r.website.name }));
  }
}
