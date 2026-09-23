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
    // Như dữ liệu import: updatedAt = createdAt (chưa ai sửa).
    createdAt: new Date('2026-09-17T04:31:49Z'),
    updatedAt: new Date('2026-09-17T04:31:49Z'),
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
  const imported = new Date('2026-09-17T04:31:49Z');
  const old = (id: string, over: Record<string, unknown> = {}) =>
    fakeLead({ id, date: new Date('2026-06-01'), createdAt: imported, updatedAt: imported, activities: [], ...over });

  it('lead import chưa ai sửa: dựa vào ngày nhận lead, không coi ngày import là lần chăm sóc', async () => {
    const leads = Array.from({ length: 12 }, (_, i) => old(`l${i}`));
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue(leads) },
    } as unknown as PrismaService);

    const res = await service.staleLeads(sales, { staleDays: 14, limit: 5 });

    expect(res.total).toBe(12);
    expect(res.leads).toHaveLength(5);
    expect(res.leads[0].daysSinceUpdate).toBeNull();
  });

  it('lead vừa được sửa (đổi trạng thái/ghi chú) không bị coi là bỏ quên', async () => {
    const leads = [old('cu'), old('vua-sua', { updatedAt: new Date() })];
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue(leads) },
    } as unknown as PrismaService);

    const res = await service.staleLeads(sales, { staleDays: 14 });

    expect(res.leads.map((l) => l.leadId)).toEqual(['cu']);
  });
});

describe('LeadInsightsService - lần liên hệ thật', () => {
  it('lead có lần liên hệ gần đây không bị coi là bỏ quên', async () => {
    const leads = Array.from({ length: 12 }, (_, i) =>
      fakeLead({ id: `l${i}`, date: new Date('2026-06-01'), activities: [] }),
    );
    leads[0] = fakeLead({
      id: 'vua-goi',
      date: new Date('2026-06-01'),
      activities: [{ type: 'call', happenedAt: new Date(), note: 'Khách hẹn thứ 6' }],
    });
    const service = new LeadInsightsService({
      lead: { findMany: vi.fn().mockResolvedValue(leads) },
    } as unknown as PrismaService);

    const res = await service.staleLeads(sales, { staleDays: 14, limit: 50 });

    expect(res.total).toBe(11);
    expect(res.leads.map((l) => l.leadId)).not.toContain('vua-goi');
  });

  it('tóm tắt lead có lastContact và nextReminder', async () => {
    const service = new LeadInsightsService({
      lead: {
        findMany: vi.fn().mockResolvedValue([
          fakeLead({
            activities: [{ type: 'message', happenedAt: new Date('2026-09-20T03:00:00Z'), note: 'Gửi mẫu qua 0909123456' }],
            reminders: [{ dueAt: new Date('2026-09-26T02:00:00Z'), note: 'Gọi hỏi kết quả' }],
          }),
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService);

    const res = await service.myOpenLeads(sales, {});

    expect(res.leads[0].lastContact).toMatchObject({ date: '2026-09-20', type: 'Nhắn tin', note: 'Gửi mẫu qua [SĐT]' });
    expect(res.leads[0].nextReminder).toMatchObject({ due: '2026-09-26 09:00', note: 'Gọi hỏi kết quả' });
  });
});
