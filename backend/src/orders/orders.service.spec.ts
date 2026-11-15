import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const sales: JwtPayload = {
  sub: 'rep1',
  email: 's@x.vn',
  role: 'sales',
  team: null,
};
const existingOrder = {
  id: 'o1',
  date: new Date('2026-11-01'),
  value: 1_000_000,
  product: 'Ly sứ',
  status: 'cho_xu_ly',
  salesRepId: 'rep1',
  leadId: null,
};

function setup(opts: { order?: unknown; lead?: unknown } = {}) {
  const prisma = {
    order: {
      findMany: vi.fn().mockResolvedValue([{ id: 'o1' }]),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.order === undefined ? existingOrder : opts.order,
        ),
      count: vi.fn().mockResolvedValue(30),
      aggregate: vi.fn().mockResolvedValue({ _sum: { value: null } }),
      create: vi.fn(({ data }) => ({ id: 'o-new', ...data })),
      update: vi.fn(({ data }) => ({ id: 'o1', ...data })),
    },
    lead: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opts.lead === undefined ? { id: 'l1' } : opts.lead),
    },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
    website: {
      findMany: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Gốm Sứ' }]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'rep1', name: 'Oanh' }]),
    },
  };
  return {
    service: new OrdersService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('OrdersService.findAll', () => {
  it('không phân trang: trả mảng, scope của sales + bỏ đơn đã xoá', async () => {
    const { service, prisma } = setup();
    expect(await service.findAll(sales, {})).toEqual([{ id: 'o1' }]);
    expect(prisma.order.findMany.mock.calls[0][0].where.AND).toEqual([
      { salesRepId: 'rep1' },
      { deletedAt: null },
      {},
      {},
      {},
    ]);
  });

  it('có phân trang: tổng giá trị loại đơn huỷ, mặc định 0 khi không có đơn', async () => {
    const { service, prisma } = setup();
    const res = await service.findAll(sales, {
      page: 2,
      pageSize: 10,
      status: 'da_giao',
      websiteId: 'w1',
      salesRepId: 'rep1',
    });
    expect(res).toMatchObject({
      total: 30,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      totalValue: 0,
    });
    const aggWhere = prisma.order.aggregate.mock.calls[0][0].where.AND;
    expect(aggWhere.at(-1)).toEqual({ status: { not: 'huy' } });
    expect(aggWhere).toContainEqual({ websiteId: 'w1' });
    expect(prisma.order.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 10,
    });
  });
});

describe('OrdersService - tạo/sửa/xoá', () => {
  it('tạo đơn: mặc định chờ xử lý + ghi audit log', async () => {
    const { service, prisma } = setup();
    await service.create(
      {
        date: '2026-11-02',
        websiteId: 'w1',
        value: 5,
        product: 'Cốc',
        salesRepId: 'rep1',
      },
      sales,
    );
    expect(prisma.order.create.mock.calls[0][0].data).toMatchObject({
      status: 'cho_xu_ly',
      createdById: 'rep1',
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      entityId: 'o-new',
      action: 'create',
    });
  });

  it('tạo/sửa đơn gắn lead không tồn tại → 404', async () => {
    const { service, prisma } = setup({ lead: null });
    const dto = {
      date: '2026-11-02',
      websiteId: 'w1',
      value: 5,
      product: 'Cốc',
      salesRepId: 'rep1',
      leadId: 'x',
    };
    await expect(service.create(dto, sales)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update('o1', { leadId: 'x' }, sales),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('sửa đơn: chỉ ghi audit cho field thực sự đổi giá trị', async () => {
    const { service, prisma } = setup();
    await service.update(
      'o1',
      { value: 2_000_000, product: 'Ly sứ', date: '2026-11-05' },
      sales,
    );
    const audits = prisma.auditLog.createMany.mock.calls[0][0].data;
    expect(audits.map((a: { field: string }) => a.field)).toEqual([
      'value',
      'date',
    ]);
    expect(audits[0]).toMatchObject({
      oldValue: '1000000',
      newValue: '2000000',
      changedById: 'rep1',
    });
    expect(prisma.order.update.mock.calls[0][0].data.date).toBeInstanceOf(Date);
  });

  it('sửa không đổi gì thì không ghi audit', async () => {
    const { service, prisma } = setup();
    await service.update('o1', { product: 'Ly sứ' }, sales);
    expect(prisma.auditLog.createMany).not.toHaveBeenCalled();
  });

  it('xoá mềm + audit; đơn ngoài phạm vi → 404', async () => {
    const { service, prisma } = setup();
    await expect(service.remove('o1', sales)).resolves.toEqual({ ok: true });
    expect(prisma.order.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
      Date,
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('delete');

    const out = setup({ order: null });
    await expect(out.service.remove('o9', sales)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      out.service.update('o9', { value: 1 }, sales),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrdersService.importRows', () => {
  it('nhập dòng hợp lệ, báo lỗi từng dòng sai website/sales/giá trị', async () => {
    const { service, prisma } = setup();
    const base = {
      date: '2026-11-01',
      websiteName: 'Gốm Sứ',
      value: '500000',
      product: 'Ly',
      salesRepName: 'Oanh',
    };
    const res = await service.importRows(
      [
        base,
        { ...base, status: 'da_giao' },
        { ...base, websiteName: 'Không có' },
        { ...base, salesRepName: 'Ai đó' },
        { ...base, value: 'abc' },
        { ...base, value: '-5' },
      ],
      sales,
    );
    expect(res.success).toBe(2);
    expect(res.failed).toBe(4);
    expect(res.errors).toEqual([
      'Dòng 3: không tìm thấy website "Không có"',
      'Dòng 4: không tìm thấy Sales "Ai đó"',
      'Dòng 5: giá trị đơn hàng không hợp lệ',
      'Dòng 6: giá trị đơn hàng không hợp lệ',
    ]);
    expect(prisma.order.create.mock.calls[1][0].data.status).toBe('da_giao');
  });
});
