import { describe, expect, it, vi } from 'vitest';
import { LeadInsightsService } from './lead-insights.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';

const sales: JwtPayload = { sub: 'rep1', email: 's@x.vn', role: 'sales', team: null };

function fakeLead(over: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    customerName: 'Anh Tuấn',
    contact: '0909123456',
    channel: 'zalo',
    status: 'dang_cham_soc',
    interest: 'Ly thủy tinh - SL: 500',
    note: 'Công ty: ABC\nXử lý: Đã gửi báo giá, SĐT 0912 345 678',
    date: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-17'),
    website: { name: 'Quà Tặng SG' },
    salesRep: { name: 'Oanh' },
    salesRepId: 'rep1',
    orders: [],
    _count: { orders: 0 },
    ...over,
  };
}

describe('LeadInsightsService', () => {
  it('leadDetail lọc theo scope của sales và trả như không tồn tại nếu ngoài quyền', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new LeadInsightsService({ lead: { findFirst } } as unknown as PrismaService);

    const res = await service.leadDetail(sales, 'lead-cua-nguoi-khac');

    expect(findFirst.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([{ salesRepId: 'rep1' }, { id: 'lead-cua-nguoi-khac' }, { deletedAt: null }]),
    );
    expect(res).toEqual({ error: expect.stringContaining('Không tìm thấy lead') });
  });

  it('không trả trường contact và che SĐT trong ghi chú', async () => {
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue([fakeLead()]), count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaService);

    const res = await service.myOpenLeads(sales, {});
    const json = JSON.stringify(res);

    expect(json).not.toContain('0909123456');
    expect(json).not.toContain('0912 345 678');
    expect(res.leads[0]).toMatchObject({
      leadId: 'l1',
      customer: 'Anh Tuấn',
      channel: 'Zalo',
      status: 'Đang chăm sóc',
      note: 'Công ty: ABC\nXử lý: Đã gửi báo giá, SĐT [SĐT]',
    });
    expect(res.leads[0]).not.toHaveProperty('contact');
  });

  it('leadFunnel gom đơn không gắn lead vào nhóm riêng khi groupBy=channel', async () => {
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue([fakeLead()]) },
      order: {
        findMany: vi.fn().mockResolvedValue([
          { value: 1000, status: 'da_giao', websiteId: 'w', salesRepId: 'rep1', website: { name: 'W' }, salesRep: { name: 'Oanh' }, lead: null },
        ]),
      },
    } as unknown as PrismaService);

    const res = await service.leadFunnel(sales, { start: '2026-09-01', end: '2026-09-30', groupBy: 'channel' });

    expect(res.groups.map((g) => g.group)).toEqual(['Zalo', 'Đơn không gắn lead']);
  });
});

describe('LeadInsightsService.staleLeads', () => {
  const old = (id: string, updatedAt: string) =>
    fakeLead({ id, date: new Date('2026-06-01'), updatedAt: new Date(updatedAt) });

  it('bỏ qua ngày cập nhật khi đó là ngày import (mọi lead cùng một ngày)', async () => {
    const leads = Array.from({ length: 12 }, (_, i) => old(`l${i}`, '2026-09-17T08:00:00Z'));
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue(leads) },
    } as unknown as PrismaService);

    const res = await service.staleLeads(sales, { staleDays: 14, limit: 5 });

    expect(res.total).toBe(12);
    expect(res.leads).toHaveLength(5);
    expect(res.warning).toContain('import');
  });

  it('khi ngày cập nhật đáng tin thì loại lead vừa được cập nhật', async () => {
    const leads = [old('cu', '2026-06-02T00:00:00Z'), old('vua-cap-nhat', new Date().toISOString())];
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue(leads) },
    } as unknown as PrismaService);

    const res = await service.staleLeads(sales, { staleDays: 14 });

    expect(res.warning).toBeNull();
    expect(res.leads.map((l) => l.leadId)).toEqual(['cu']);
  });
});
