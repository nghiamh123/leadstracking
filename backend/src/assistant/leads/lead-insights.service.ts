import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { leadOrderScope } from '../../common/scope.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { LeadStatus } from '../../generated/prisma/enums.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { clampLimit } from '../seo/seo-insights.service.js';
import {
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
    const open = await this.prisma.lead.findMany({
      where: this.leadWhere(user, { status: { in: OPEN_STATUSES } }),
      select: { date: true, updatedAt: true, salesRepId: true, salesRep: { select: { name: true } } },
    });
    const staleBefore = daysAgo(params.staleDays);
    const weekAgo = daysAgo(7);
    const warning = importedDatesWarning(open.map((l) => l.updatedAt));

    const byRep = new Map<
      string,
      { salesRepId: string; salesRep: string; openLeads: number; staleLeads: number; newLast7Days: number; oldestOpenDays: number }
    >();
    for (const l of open) {
      let r = byRep.get(l.salesRepId);
      if (!r) {
        r = { salesRepId: l.salesRepId, salesRep: l.salesRep.name, openLeads: 0, staleLeads: 0, newLast7Days: 0, oldestOpenDays: 0 };
        byRep.set(l.salesRepId, r);
      }
      r.openLeads++;
      if (isStale(l, staleBefore, warning !== null)) r.staleLeads++;
      if (l.date >= weekAgo) r.newLast7Days++;
      r.oldestOpenDays = Math.max(r.oldestOpenDays, daysSince(l.date));
    }

    return {
      staleDefinition: staleDefinition(params.staleDays, warning !== null),
      warning,
      reps: [...byRep.values()].sort((a, b) => b.openLeads - a.openLeads),
    };
  }

  /** Lead đang mở bị bỏ lâu - cũ nhất trước. */
  async staleLeads(user: JwtPayload, params: { staleDays: number; salesRepId?: string; limit?: number }) {
    const staleBefore = daysAgo(params.staleDays);
    // Lọc updatedAt trong bộ nhớ (không trong SQL) vì cần biết ngày cập nhật có phải ngày import không.
    const candidates = await this.prisma.lead.findMany({
      where: this.leadWhere(
        user,
        { status: { in: OPEN_STATUSES } },
        { date: { lt: staleBefore } },
        params.salesRepId ? { salesRepId: params.salesRepId } : {},
      ),
      include: { website: { select: { name: true } }, salesRep: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const warning = importedDatesWarning(candidates.map((r) => r.updatedAt));
    const stale = candidates.filter((r) => isStale(r, staleBefore, warning !== null));
    const rows = stale.slice(0, clampLimit(params.limit));
    return {
      staleDefinition: staleDefinition(params.staleDays, warning !== null),
      warning,
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
      warning: importedDatesWarning(rows.map((r) => r.updatedAt)),
      leads: rows.map((r) => ({ ...leadSummary(r, 400), orderCount: r._count.orders })),
    };
  }

  /** Tìm lead theo tên khách, tên công ty/ghi chú hoặc sản phẩm quan tâm (mọi trạng thái). */
  async searchLeads(user: JwtPayload, params: { query: string; limit?: number }) {
    const q = { contains: params.query, mode: 'insensitive' as const };
    const rows = await this.prisma.lead.findMany({
      where: this.leadWhere(user, { OR: [{ customerName: q }, { note: q }, { interest: q }] }),
      include: { website: { select: { name: true } }, salesRep: { select: { name: true } } },
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
    updatedAt: Date;
    website: { name: string };
  },
  noteMax: number,
) {
  return {
    leadId: r.id,
    customer: r.customerName,
    website: r.website.name,
    channel: CHANNEL_LABELS[r.channel],
    status: STATUS_LABELS[r.status],
    interest: maskContactInfo(r.interest),
    leadDate: r.date.toISOString().slice(0, 10),
    daysSinceLead: daysSince(r.date),
    daysSinceUpdate: daysSince(r.updatedAt),
    note: excerpt(maskContactInfo(r.note), noteMax),
  };
}

/**
 * Lead mở bị bỏ quên: nhận đã lâu và lâu không cập nhật. Khi ngày cập nhật chỉ là ngày import
 * (không phản ánh lần liên hệ thật) thì chỉ xét tuổi lead - nếu không, mọi lead import gần đây
 * đều bị coi là "vừa cập nhật" và danh sách luôn rỗng.
 */
function isStale(l: { date: Date; updatedAt: Date }, staleBefore: Date, updatesUnreliable: boolean): boolean {
  return l.date < staleBefore && (updatesUnreliable || l.updatedAt < staleBefore);
}

function staleDefinition(staleDays: number, updatesUnreliable: boolean): string {
  return updatesUnreliable
    ? `Lead đang mở, nhận từ hơn ${staleDays} ngày trước (không xét ngày cập nhật vì đó là ngày import)`
    : `Lead đang mở, nhận từ hơn ${staleDays} ngày trước và không được cập nhật trong ${staleDays} ngày`;
}

/**
 * Dữ liệu import hàng loạt làm mọi lead có cùng ngày cập nhật - khi đó "số ngày chưa cập nhật"
 * không phản ánh lần liên hệ thật, model phải nói rõ thay vì kết luận sales bỏ bê khách.
 */
export function importedDatesWarning(updatedAts: Date[]): string | null {
  if (updatedAts.length < 10) return null;
  const days = new Set(updatedAts.map((d) => d.toISOString().slice(0, 10)));
  if (days.size > 1) return null;
  return `Tất cả ${updatedAts.length} lead có cùng ngày cập nhật (${[...days][0]}) - nhiều khả năng là ngày import dữ liệu, không phản ánh lần liên hệ khách thật. "daysSinceUpdate" không đáng tin.`;
}
