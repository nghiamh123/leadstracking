import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { leadOrderScope } from '../common/scope.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

export interface DashboardQuery {
  websiteId?: string;
  start: string;
  end: string;
  salesRepId?: string;
}

function listDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(user: JwtPayload, query: DashboardQuery) {
    const [clicks, leadCount, orderCount] = await Promise.all([
      this.sumClicks(query),
      this.countLeads(user, query),
      this.countOrders(user, query),
    ]);
    return { clicks, leadCount, orderCount };
  }

  async trend(user: JwtPayload, query: DashboardQuery) {
    const dates = listDates(query.start, query.end);

    const [traffic, leads, orders] = await Promise.all([
      this.prisma.gscDailyTraffic.findMany({
        where: {
          websiteId: query.websiteId,
          date: { gte: new Date(query.start), lte: new Date(query.end) },
        },
        select: { date: true, clicks: true },
      }),
      this.prisma.lead.findMany({
        where: { AND: this.leadOrderConditions(user, query) },
        select: { date: true },
      }),
      this.prisma.order.findMany({
        where: { AND: this.leadOrderConditions(user, query) },
        select: { date: true },
      }),
    ]);

    // Gom theo ngày một lượt (Map) thay vì lọc lại toàn bộ mảng cho từng ngày.
    const clicksByDate = sumByDate(traffic, (t) => t.clicks);
    const leadsByDate = sumByDate(leads, () => 1);
    const ordersByDate = sumByDate(orders, () => 1);
    return dates.map((date) => ({
      date,
      clicks: clicksByDate.get(date) ?? 0,
      leads: leadsByDate.get(date) ?? 0,
      orders: ordersByDate.get(date) ?? 0,
    }));
  }

  /** Traffic theo ngày, tách riêng từng website (dùng cho chart nhiều đường khi xem "Tất cả website"). */
  async trendByWebsite(query: { start: string; end: string }) {
    const dates = listDates(query.start, query.end);
    const [websites, traffic] = await Promise.all([
      this.prisma.website.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, domain: true },
      }),
      this.prisma.gscDailyTraffic.findMany({
        where: { date: { gte: new Date(query.start), lte: new Date(query.end) } },
        select: { websiteId: true, date: true, clicks: true },
      }),
    ]);

    const clicks = new Map<string, number>();
    for (const t of traffic) {
      const key = `${t.websiteId}|${t.date.toISOString().slice(0, 10)}`;
      clicks.set(key, (clicks.get(key) ?? 0) + t.clicks);
    }
    const data = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const site of websites) row[site.id] = clicks.get(`${site.id}|${date}`) ?? 0;
      return row;
    });

    return { websites, data };
  }

  async byWebsite(user: JwtPayload, query: Omit<DashboardQuery, 'websiteId'>) {
    // 4 query gom nhóm theo website thay vì 3 query cho mỗi website (N+1).
    const range = { gte: new Date(query.start), lte: new Date(query.end) };
    const [websites, traffic, leads, orders] = await Promise.all([
      this.prisma.website.findMany({ select: { id: true, name: true } }),
      this.prisma.gscDailyTraffic.groupBy({
        by: ['websiteId'],
        where: { date: range },
        _sum: { clicks: true },
      }),
      this.prisma.lead.groupBy({
        by: ['websiteId'],
        where: { AND: this.leadOrderConditions(user, query) },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['websiteId'],
        where: { AND: this.leadOrderConditions(user, query) },
        _count: { _all: true },
      }),
    ]);
    const clicksBySite = new Map(traffic.map((t) => [t.websiteId, t._sum.clicks ?? 0]));
    const leadsBySite = new Map(leads.map((l) => [l.websiteId, l._count._all]));
    const ordersBySite = new Map(orders.map((o) => [o.websiteId, o._count._all]));

    return websites.map((site) => {
      const clicks = clicksBySite.get(site.id) ?? 0;
      const leadCount = leadsBySite.get(site.id) ?? 0;
      const orderCount = ordersBySite.get(site.id) ?? 0;
      return {
        websiteId: site.id,
        websiteName: site.name,
        clicks,
        leadCount,
        orderCount,
        leadRate: pct(leadCount, clicks),
        orderRate: pct(orderCount, leadCount),
        totalRate: pct(orderCount, clicks),
      };
    });
  }

  /**
   * Toàn bộ dữ liệu trang Tổng quan trong 1 request (trước đây 5 request song song, vượt giới hạn
   * 6 kết nối HTTP/1.1 của trình duyệt khi cộng thêm các request khác của trang). Chỉ tính biểu đồ
   * xu hướng đang hiển thị: theo từng website khi xem tất cả, hoặc theo 1 website khi đã chọn.
   */
  async overview(user: JwtPayload, query: DashboardQuery & { prevStart: string; prevEnd: string }) {
    const { prevStart, prevEnd, ...current } = query;
    const [summary, previous, trend, trendByWebsite, byWebsite] = await Promise.all([
      this.summary(user, current),
      this.summary(user, { ...current, start: prevStart, end: prevEnd }),
      current.websiteId ? this.trend(user, current) : null,
      current.websiteId ? null : this.trendByWebsite(current),
      this.byWebsite(user, { start: current.start, end: current.end, salesRepId: current.salesRepId }),
    ]);
    return { summary, previous, trend, trendByWebsite, byWebsite };
  }

  private sumClicks(query: DashboardQuery) {
    return this.prisma.gscDailyTraffic
      .aggregate({
        where: {
          websiteId: query.websiteId,
          date: { gte: new Date(query.start), lte: new Date(query.end) },
        },
        _sum: { clicks: true },
      })
      .then((r) => r._sum.clicks ?? 0);
  }

  private countLeads(user: JwtPayload, query: DashboardQuery) {
    return this.prisma.lead.count({ where: { AND: this.leadOrderConditions(user, query) } });
  }

  private countOrders(user: JwtPayload, query: DashboardQuery) {
    return this.prisma.order.count({ where: { AND: this.leadOrderConditions(user, query) } });
  }

  /** Điều kiện chung cho Lead/Order: scope theo vai trò + bộ lọc, mỗi phần một object riêng trong AND. */
  private leadOrderConditions(user: JwtPayload, query: Partial<DashboardQuery> & { start: string; end: string }) {
    return [
      leadOrderScope(user),
      { deletedAt: null },
      query.websiteId ? { websiteId: query.websiteId } : {},
      query.salesRepId ? { salesRepId: query.salesRepId } : {},
      { date: { gte: new Date(query.start), lte: new Date(query.end) } },
    ];
  }
}

function sumByDate<T extends { date: Date }>(rows: T[], value: (row: T) => number): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + value(row));
  }
  return map;
}

function pct(a: number, b: number): number {
  return b === 0 ? 0 : (a / b) * 100;
}
