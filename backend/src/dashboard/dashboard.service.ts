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
      }),
      this.prisma.lead.findMany({
        where: {
          AND: [
            leadOrderScope(user),
            { deletedAt: null },
            query.websiteId ? { websiteId: query.websiteId } : {},
            query.salesRepId ? { salesRepId: query.salesRepId } : {},
            { date: { gte: new Date(query.start), lte: new Date(query.end) } },
          ],
        },
        select: { date: true },
      }),
      this.prisma.order.findMany({
        where: {
          AND: [
            leadOrderScope(user),
            { deletedAt: null },
            query.websiteId ? { websiteId: query.websiteId } : {},
            query.salesRepId ? { salesRepId: query.salesRepId } : {},
            { date: { gte: new Date(query.start), lte: new Date(query.end) } },
          ],
        },
        select: { date: true },
      }),
    ]);

    return dates.map((date) => ({
      date,
      clicks: traffic
        .filter((t) => t.date.toISOString().slice(0, 10) === date)
        .reduce((s, t) => s + t.clicks, 0),
      leads: leads.filter((l) => l.date.toISOString().slice(0, 10) === date).length,
      orders: orders.filter((o) => o.date.toISOString().slice(0, 10) === date).length,
    }));
  }

  async byWebsite(user: JwtPayload, query: Omit<DashboardQuery, 'websiteId'>) {
    const websites = await this.prisma.website.findMany();

    return Promise.all(
      websites.map(async (site) => {
        const [clicks, leadCount, orderCount] = await Promise.all([
          this.sumClicks({ ...query, websiteId: site.id }),
          this.countLeads(user, { ...query, websiteId: site.id }),
          this.countOrders(user, { ...query, websiteId: site.id }),
        ]);
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
      }),
    );
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
    return this.prisma.lead.count({
      where: {
        AND: [
          leadOrderScope(user),
          { deletedAt: null },
          query.websiteId ? { websiteId: query.websiteId } : {},
          query.salesRepId ? { salesRepId: query.salesRepId } : {},
          { date: { gte: new Date(query.start), lte: new Date(query.end) } },
        ],
      },
    });
  }

  private countOrders(user: JwtPayload, query: DashboardQuery) {
    return this.prisma.order.count({
      where: {
        AND: [
          leadOrderScope(user),
          { deletedAt: null },
          query.websiteId ? { websiteId: query.websiteId } : {},
          query.salesRepId ? { salesRepId: query.salesRepId } : {},
          { date: { gte: new Date(query.start), lte: new Date(query.end) } },
        ],
      },
    });
  }
}

function pct(a: number, b: number): number {
  return b === 0 ? 0 : (a / b) * 100;
}
