import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { leadOrderScope } from '../../common/scope.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { LeadActivityType, LeadStatus } from '../../generated/prisma/enums.js';
import { startOfTodayVn, vnDate, vnTime } from '../../common/vn-time.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { clampLimit } from '../seo/seo-insights.service.js';
import {
  ACTIVITY_LABELS,
  CHANNEL_LABELS,
  OPEN_STATUSES,
  STATUS_LABELS,
  daysAgo,
  daysSince,
  excerpt,
  maskContactInfo,
  summarizeFunnel,
} from './lead-helpers.js';

export type FunnelGroupBy = 'channel' | 'website' | 'sales_rep';

/** Lần liên hệ gần nhất + lịch nhắc sắp tới của mỗi lead (dùng trong include). */
const careInclude = {
  activities: {
    orderBy: { happenedAt: 'desc' },
    take: 1,
    select: { type: true, happenedAt: true, note: true },
  },
  reminders: {
    where: { doneAt: null },
    orderBy: { dueAt: 'asc' },
    take: 1,
    select: { dueAt: true, note: true },
  },
} as const;

/**
 * Truy vấn lead/đơn hàng cho persona Vận hành (admin/manager) và Bán hàng (sales).
 * Mọi hàm đều lọc theo `leadOrderScope(user)` - sales chỉ thấy lead của mình, manager
 * thấy team mình, giống hệt trang Lead. Không bao giờ trả trường `contact` (SĐT/Zalo):
 * model không cần nó, người dùng xem trực tiếp trên trang Lead.
 */
@Injectable()
export class LeadInsightsService {
  constructor(private prisma: PrismaService) {}

  private leadWhere(user: JwtPayload, ...extra: Prisma.LeadWhereInput[]): Prisma.LeadWhereInput {
    // Scope và điều kiện thêm nằm ở các object riêng trong AND (xem ghi chú ở leads.service.ts).
    return { AND: [leadOrderScope(user), { deletedAt: null }, ...extra] };
  }

  /** Phễu lead → đơn trong [start, end], gom theo kênh / website / nhân viên sales. */
  async leadFunnel(user: JwtPayload, params: { start: string; end: string; groupBy: FunnelGroupBy }) {
    const date = { gte: new Date(params.start), lte: new Date(params.end) };
    const [leads, orders] = await Promise.all([
      this.prisma.lead.findMany({
        where: this.leadWhere(user, { date }),
        select: {
          status: true,
          channel: true,
          websiteId: true,
          salesRepId: true,
          website: { select: { name: true } },
          salesRep: { select: { name: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { AND: [leadOrderScope(user), { deletedAt: null }, { date }] },
        select: {
          value: true,
          status: true,
          websiteId: true,
          salesRepId: true,
          website: { select: { name: true } },
          salesRep: { select: { name: true } },
          lead: { select: { channel: true } },
        },
      }),
    ]);

    const keyOf = (r: {
      channel?: keyof typeof CHANNEL_LABELS | null;
      websiteId: string;
      salesRepId: string;
      website: { name: string };
      salesRep: { name: string };
    }) => {
      if (params.groupBy === 'website') return { key: r.websiteId, label: r.website.name };
      if (params.groupBy === 'sales_rep') return { key: r.salesRepId, label: r.salesRep.name };
      return r.channel
        ? { key: r.channel, label: CHANNEL_LABELS[r.channel] }
        : { key: 'none', label: 'Đơn không gắn lead' };
    };

    return {
      period: { start: params.start, end: params.end },
      groupBy: params.groupBy,
      ...summarizeFunnel(
        leads.map((l) => ({ ...keyOf(l), status: l.status })),
        orders.map((o) => ({ ...keyOf({ ...o, channel: o.lead?.channel }), value: o.value, status: o.status })),
      ),
    };
  }

  /** Khối lượng việc hiện tại của từng nhân viên sales (lead đang mở, lead bị bỏ lâu). */
  async teamWorkload(user: JwtPayload, params: { staleDays: number }) {
    const [open, overdue] = await Promise.all([
      this.prisma.lead.findMany({
        where: this.leadWhere(user, { status: { in: OPEN_STATUSES } }),
        select: {
          date: true,
          createdAt: true,
          updatedAt: true,
          salesRepId: true,
          salesRep: { select: { name: true } },
          activities: careInclude.activities,
        },
      }),
      this.prisma.reminder.findMany({
        where: { doneAt: null, dueAt: { lt: startOfTodayVn() }, lead: this.leadWhere(user) },
        select: { lead: { select: { salesRepId: true } } },
      }),
    ]);
    const staleBefore = daysAgo(params.staleDays);
    const weekAgo = daysAgo(7);

    const byRep = new Map<
      string,
      {
        salesRepId: string;
        salesRep: string;
        openLeads: number;
        staleLeads: number;
        newLast7Days: number;
        oldestOpenDays: number;
        overdueReminders: number;
      }
    >();
    for (const l of open) {
      let r = byRep.get(l.salesRepId);
      if (!r) {
        r = {
          salesRepId: l.salesRepId,
          salesRep: l.salesRep.name,
          openLeads: 0,
          staleLeads: 0,
          newLast7Days: 0,
          oldestOpenDays: 0,
          overdueReminders: 0,
        };
        byRep.set(l.salesRepId, r);
      }
      r.openLeads++;
      if (isStale(l, staleBefore)) r.staleLeads++;
      if (l.date >= weekAgo) r.newLast7Days++;
      r.oldestOpenDays = Math.max(r.oldestOpenDays, daysSince(l.date));
    }
    for (const o of overdue) {
      const r = byRep.get(o.lead.salesRepId);
      if (r) r.overdueReminders++;
    }

    return {
      staleDefinition: staleDefinition(params.staleDays),
      reps: [...byRep.values()].sort((a, b) => b.openLeads - a.openLeads),
    };
  }

  /** Lead đang mở bị bỏ lâu - cũ nhất trước. */
  async staleLeads(user: JwtPayload, params: { staleDays: number; salesRepId?: string; limit?: number }) {
    const staleBefore = daysAgo(params.staleDays);
    // Lọc "lần chăm sóc gần nhất" trong bộ nhớ vì nó gộp từ lần liên hệ, lần sửa lead và ngày nhận lead.
    const candidates = await this.prisma.lead.findMany({
      where: this.leadWhere(
        user,
        { status: { in: OPEN_STATUSES } },
        { date: { lt: staleBefore } },
        params.salesRepId ? { salesRepId: params.salesRepId } : {},
      ),
      include: { website: { select: { name: true } }, salesRep: { select: { name: true } }, ...careInclude },
      orderBy: { date: 'asc' },
    });
    const stale = candidates.filter((r) => isStale(r, staleBefore));
    const rows = stale.slice(0, clampLimit(params.limit));
    return {
      staleDefinition: staleDefinition(params.staleDays),
      total: stale.length,
      leads: rows.map((r) => ({
        ...leadSummary(r, 200),
        salesRep: r.salesRep.name,
        salesRepId: r.salesRepId,
      })),
    };
  }

  /** Lead đang mở của người dùng (với sales = lead của chính mình). */
  async myOpenLeads(
    user: JwtPayload,
    params: { status?: LeadStatus; sort?: 'oldest' | 'newest'; limit?: number },
  ) {
    const rows = await this.prisma.lead.findMany({
      where: this.leadWhere(user, { status: params.status ? params.status : { in: OPEN_STATUSES } }),
      include: {
        website: { select: { name: true } },
        _count: { select: { orders: { where: { deletedAt: null } } } },
        ...careInclude,
      },
      orderBy: { date: params.sort === 'oldest' ? 'asc' : 'desc' },
      take: clampLimit(params.limit ?? 30),
    });
    const total = await this.prisma.lead.count({
      where: this.leadWhere(user, { status: params.status ? params.status : { in: OPEN_STATUSES } }),
    });
    return {
      total,
      shown: rows.length,
      leads: rows.map((r) => ({ ...leadSummary(r, 400), orderCount: r._count.orders })),
    };
  }

  /** Tìm lead theo tên khách, tên công ty/ghi chú hoặc sản phẩm quan tâm (mọi trạng thái). */
  async searchLeads(user: JwtPayload, params: { query: string; limit?: number }) {
    const q = { contains: params.query, mode: 'insensitive' as const };
    const rows = await this.prisma.lead.findMany({
      where: this.leadWhere(user, { OR: [{ customerName: q }, { note: q }, { interest: q }] }),
      include: { website: { select: { name: true } }, salesRep: { select: { name: true } }, ...careInclude },
      orderBy: { date: 'desc' },
      take: clampLimit(params.limit),
    });
    return rows.map((r) => ({ ...leadSummary(r, 200), salesRep: r.salesRep.name }));
  }

  /** Chi tiết một lead: ghi chú đầy đủ, đơn hàng, lịch sử thay đổi. */
  async leadDetail(user: JwtPayload, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: this.leadWhere(user, { id: leadId }),
      include: {
        website: { select: { name: true } },
        salesRep: { select: { name: true } },
        orders: {
          where: { deletedAt: null },
          select: { date: true, product: true, value: true, status: true },
          orderBy: { date: 'desc' },
        },
        activities: {
          orderBy: { happenedAt: 'desc' },
          take: 10,
          select: { type: true, happenedAt: true, note: true, user: { select: { name: true } } },
        },
        reminders: { where: { doneAt: null }, orderBy: { dueAt: 'asc' }, select: { dueAt: true, note: true } },
      },
    });
    // Ngoài quyền xem thì trả như không tồn tại - không để lộ lead của người khác.
    if (!lead) return { error: 'Không tìm thấy lead (hoặc lead không thuộc quyền xem của bạn).' };

    const history = await this.prisma.auditLog.findMany({
      where: { entityType: 'lead', entityId: lead.id },
      include: { changedBy: { select: { name: true } } },
      orderBy: { changedAt: 'asc' },
    });

    return {
      ...leadSummary(lead, 2000),
      salesRep: lead.salesRep.name,
      orders: lead.orders.map((o) => ({ ...o, date: o.date.toISOString().slice(0, 10) })),
      contactHistory: lead.activities.map((a) => ({
        date: vnDate(a.happenedAt),
        type: ACTIVITY_LABELS[a.type],
        by: a.user.name,
        note: maskContactInfo(a.note),
      })),
      openReminders: lead.reminders.map(formatReminder),
      history: history.map((h) => ({
        at: h.changedAt.toISOString().slice(0, 10),
        by: h.changedBy.name,
        action: h.action,
        field: h.field,
        from: maskContactInfo(h.oldValue),
        to: maskContactInfo(h.newValue),
      })),
    };
  }
}

function leadSummary(
  r: {
    id: string;
    customerName: string;
    channel: keyof typeof CHANNEL_LABELS;
    status: LeadStatus;
    interest: string;
    note: string | null;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
    website: { name: string };
    activities?: { type: LeadActivityType; happenedAt: Date; note: string | null }[];
    reminders?: { dueAt: Date; note: string }[];
  },
  noteMax: number,
) {
  const last = r.activities?.[0];
  const next = r.reminders?.[0];
  return {
    leadId: r.id,
    customer: r.customerName,
    website: r.website.name,
    channel: CHANNEL_LABELS[r.channel],
    status: STATUS_LABELS[r.status],
    interest: maskContactInfo(r.interest),
    leadDate: r.date.toISOString().slice(0, 10),
    daysSinceLead: daysSince(r.date),
    // null = chưa sửa gì kể từ khi tạo/import (updatedAt lúc đó chỉ là thời điểm tạo, không phải lần chăm sóc).
    daysSinceUpdate: wasEdited(r) ? daysSince(r.updatedAt) : null,
    note: excerpt(maskContactInfo(r.note), noteMax),
    // Lần liên hệ thật gần nhất (sales ghi lại) - đáng tin hơn daysSinceUpdate.
    lastContact: last
      ? {
          date: vnDate(last.happenedAt),
          daysAgo: daysSince(last.happenedAt),
          type: ACTIVITY_LABELS[last.type],
          note: excerpt(maskContactInfo(last.note), 150),
        }
      : null,
    nextReminder: next ? formatReminder(next) : null,
  };
}

function formatReminder(r: { dueAt: Date; note: string }) {
  return {
    due: `${vnDate(r.dueAt)} ${vnTime(r.dueAt)}`,
    overdue: r.dueAt < startOfTodayVn(),
    note: excerpt(maskContactInfo(r.note), 150),
  };
}

/** Lead được sửa sau khi tạo (đổi trạng thái, ghi chú, ghi liên hệ...) - import hàng loạt thì updatedAt = createdAt. */
function wasEdited(l: { createdAt: Date; updatedAt: Date }): boolean {
  return l.updatedAt.getTime() - l.createdAt.getTime() > 60_000;
}

/**
 * Lần chăm sóc gần nhất: lần liên hệ sales ghi lại > lần sửa lead > ngày nhận lead.
 * Không dùng updatedAt của lead chưa từng được sửa - lúc đó nó chỉ là thời điểm tạo/import.
 */
function lastTouch(l: { date: Date; createdAt: Date; updatedAt: Date; activities?: { happenedAt: Date }[] }): Date {
  return l.activities?.[0]?.happenedAt ?? (wasEdited(l) ? l.updatedAt : l.date);
}

function isStale(
  l: { date: Date; createdAt: Date; updatedAt: Date; activities?: { happenedAt: Date }[] },
  staleBefore: Date,
): boolean {
  return l.date < staleBefore && lastTouch(l) < staleBefore;
}

function staleDefinition(staleDays: number): string {
  return `Lead đang mở, nhận từ hơn ${staleDays} ngày trước và không có lần liên hệ/cập nhật nào trong ${staleDays} ngày qua`;
}
