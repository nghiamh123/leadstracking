import type { LeadChannel, LeadStatus, OrderStatus } from '../../generated/prisma/enums.js';

/** Hàm dùng chung cho persona Vận hành và Bán hàng (dữ liệu lead/đơn hàng). */

export const CHANNEL_LABELS: Record<LeadChannel, string> = {
  form_web: 'Form web',
  zalo: 'Zalo',
  fanpage: 'Fanpage',
  hotline: 'Hotline',
  chat: 'Chat',
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  moi: 'Mới',
  dang_cham_soc: 'Đang chăm sóc',
  da_chuyen_don: 'Đã chuyển đơn',
  huy: 'Huỷ',
};

export const OPEN_STATUSES: LeadStatus[] = ['moi', 'dang_cham_soc'];

const DAY_MS = 86_400_000;

export function daysSince(d: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

export function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getTime() - n * DAY_MS);
}

/**
 * Che số điện thoại/email trước khi gửi nội dung lên AI - ghi chú lead đôi khi chứa
 * thông tin liên hệ, mà model không cần chúng để phân tích.
 */
export function maskContactInfo(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, '[SĐT]');
}

export function excerpt(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function pct(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a / b) * 1000) / 10;
}

export interface FunnelLead {
  key: string;
  label: string;
  status: LeadStatus;
}

export interface FunnelOrder {
  key: string;
  label: string;
  value: number;
  status: OrderStatus;
}

/** Gộp lead + đơn theo nhóm (kênh/website/sales). Đơn huỷ không tính vào số đơn và doanh thu. */
export function summarizeFunnel(leads: FunnelLead[], orders: FunnelOrder[]) {
  const groups = new Map<
    string,
    { group: string; leads: number; open: number; converted: number; cancelled: number; orders: number; revenue: number }
  >();
  const get = (key: string, label: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { group: label, leads: 0, open: 0, converted: 0, cancelled: 0, orders: 0, revenue: 0 };
      groups.set(key, g);
    }
    return g;
  };

  for (const l of leads) {
    const g = get(l.key, l.label);
    g.leads++;
    if (OPEN_STATUSES.includes(l.status)) g.open++;
    else if (l.status === 'da_chuyen_don') g.converted++;
    else g.cancelled++;
  }
  for (const o of orders) {
    if (o.status === 'huy') continue;
    const g = get(o.key, o.label);
    g.orders++;
    g.revenue += o.value;
  }

  const rows = [...groups.values()]
    .map((g) => ({
      ...g,
      convertedPercent: pct(g.converted, g.leads),
      cancelledPercent: pct(g.cancelled, g.leads),
    }))
    .sort((a, b) => b.leads - a.leads || b.revenue - a.revenue);

  const total = rows.reduce(
    (t, r) => ({
      leads: t.leads + r.leads,
      open: t.open + r.open,
      converted: t.converted + r.converted,
      cancelled: t.cancelled + r.cancelled,
      orders: t.orders + r.orders,
      revenue: t.revenue + r.revenue,
    }),
    { leads: 0, open: 0, converted: 0, cancelled: 0, orders: 0, revenue: 0 },
  );

  return {
    total: { ...total, convertedPercent: pct(total.converted, total.leads) },
    groups: rows,
  };
}
