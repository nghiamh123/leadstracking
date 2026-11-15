import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import type { SignalRow } from './signal-import.util.js';

const sales: JwtPayload = {
  sub: 'rep1',
  email: 's@x.vn',
  role: 'sales',
  team: null,
};
const admin: JwtPayload = {
  sub: 'adm',
  email: 'a@x.vn',
  role: 'admin',
  team: null,
};
const existingLead = {
  id: 'l1',
  customerName: 'Chị Mai',
  status: 'moi',
  contact: '0912345678',
  note: null,
};

function setup(opts: { lead?: unknown } = {}) {
  let n = 0;
  const prisma = {
    lead: {
      findMany: vi.fn().mockResolvedValue([{ id: 'l1' }]),
      findFirst: vi
        .fn()
        .mockResolvedValue(opts.lead === undefined ? existingLead : opts.lead),
      count: vi.fn().mockResolvedValue(12),
      create: vi.fn(({ data }) => ({ id: `lead${++n}`, ...data })),
      update: vi.fn(({ data }) => ({ id: 'l1', ...data })),
    },
    auditLog: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: 'a1' }]),
    },
    website: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'w1', name: 'Gốm Sứ', domain: 'sanxuatgomsu.vn' },
        { id: 'w2', name: 'Quà Tặng SG', domain: 'quatangsg.vn' },
      ]),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'rep1', name: 'Oanh', email: 'oanh@leadstracking.local' },
        ]),
    },
  };
  const usersService = {
    invite: vi.fn(({ name, email }) => ({ id: `u-${name}`, name, email })),
  };
  const ordersService = { create: vi.fn().mockResolvedValue({ id: 'o1' }) };
  const service = new LeadsService(
    prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
    ordersService as unknown as OrdersService,
  );
  return { service, prisma, usersService, ordersService };
}

describe('LeadsService.findAll', () => {
  it('scope theo vai trò nằm riêng trong AND - filter salesRepId không ghi đè được scope', async () => {
    const { service, prisma } = setup();
    await service.findAll(sales, { salesRepId: 'someone-else' });
    const and = prisma.lead.findMany.mock.calls[0][0].where.AND;
    expect(and[0]).toEqual({ salesRepId: 'rep1' });
    expect(and).toContainEqual({ salesRepId: 'someone-else' });
  });

  it('tìm theo tên (không phân biệt hoa thường) hoặc SĐT', async () => {
    const { service, prisma } = setup();
    await service.findAll(admin, { search: 'mai' });
    expect(prisma.lead.findMany.mock.calls[0][0].where.OR).toEqual([
      { customerName: { contains: 'mai', mode: 'insensitive' } },
      { contact: { contains: 'mai' } },
    ]);
  });

  it('có page → trả dữ liệu phân trang', async () => {
    const { service, prisma } = setup();
    const res = await service.findAll(admin, {
      page: 2,
      pageSize: 5,
      status: 'moi',
      websiteId: 'w1',
    });
    expect(res).toMatchObject({
      total: 12,
      page: 2,
      pageSize: 5,
      totalPages: 3,
    });
    expect(prisma.lead.findMany.mock.calls[0][0]).toMatchObject({
      skip: 5,
      take: 5,
    });
  });
});

describe('LeadsService - lịch sử/tạo/sửa/xoá', () => {
  it('lịch sử chỉ xem được lead trong phạm vi', async () => {
    const { service } = setup();
    expect(await service.findHistory('l1', sales)).toEqual([{ id: 'a1' }]);
    const out = setup({ lead: null });
    await expect(out.service.findHistory('l9', sales)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('tạo lead: mặc định trạng thái Mới + audit', async () => {
    const { service, prisma } = setup();
    await service.create(
      {
        date: '2026-11-01',
        websiteId: 'w1',
        customerName: 'A',
        contact: '0912345678',
        channel: 'zalo',
        interest: 'Ly',
        salesRepId: 'rep1',
      },
      sales,
    );
    expect(prisma.lead.create.mock.calls[0][0].data).toMatchObject({
      status: 'moi',
      createdById: 'rep1',
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('create');
  });

  it('sửa lead: audit đúng field thay đổi', async () => {
    const { service, prisma } = setup();
    await service.update(
      'l1',
      { status: 'dang_cham_soc', customerName: 'Chị Mai', date: '2026-11-03' },
      sales,
    );
    const fields = prisma.auditLog.createMany.mock.calls[0][0].data.map(
      (a: { field: string }) => a.field,
    );
    expect(fields).toEqual(['status', 'date']);
    expect(prisma.lead.update.mock.calls[0][0].data.date).toBeInstanceOf(Date);
  });

  it('sửa không đổi gì → không audit; ngoài phạm vi → 404', async () => {
    const { service, prisma } = setup();
    await service.update('l1', { customerName: 'Chị Mai' }, sales);
    expect(prisma.auditLog.createMany).not.toHaveBeenCalled();
    const out = setup({ lead: null });
    await expect(out.service.update('l9', {}, sales)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(out.service.remove('l9', sales)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('xoá mềm + audit', async () => {
    const { service, prisma } = setup();
    await expect(service.remove('l1', sales)).resolves.toEqual({ ok: true });
    expect(prisma.lead.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
      Date,
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('delete');
  });
});

describe('LeadsService.importRows (CSV template)', () => {
  it('kiểm tra website, sales, kênh và SĐT từng dòng', async () => {
    const { service } = setup();
    const base = {
      date: '2026-11-01',
      websiteName: 'Gốm Sứ',
      customerName: 'A',
      contact: '0912345678',
      channel: 'zalo',
      interest: 'Ly',
      salesRepName: 'Oanh',
    };
    const res = await service.importRows(
      [
        base,
        { ...base, websiteName: 'X' },
        { ...base, salesRepName: 'Y' },
        { ...base, channel: 'fax' },
        { ...base, contact: '12345' },
      ],
      sales,
    );
    expect(res).toEqual({
      success: 1,
      failed: 4,
      errors: [
        'Dòng 2: không tìm thấy website "X"',
        'Dòng 3: không tìm thấy Sales "Y"',
        'Dòng 4: kênh hoặc SĐT không hợp lệ',
        'Dòng 5: kênh hoặc SĐT không hợp lệ',
      ],
    });
  });
});

describe('LeadsService.importSignalRows (file TÍN HIỆU ONLINE)', () => {
  const row = (extra: Partial<SignalRow> = {}): SignalRow => ({
    ngay: '5.11',
    nguon: 'SXGS',
    kenh: 'Zalo',
    tenKhachHang: 'Anh Tú',
    tenCongTy: 'Cty ABC',
    phanLoaiKh: 'Doanh nghiệp',
    dienThoai: '84 912 345 678',
    sanPham: 'Ly sứ',
    soLuong: '200',
    xuLy: 'Đã báo giá',
    tinhTrangTinHieu: 'Đang tư vấn',
    kdPhuTrach: 'oanh',
    ...extra,
  });

  it('tạo lead đang chăm sóc với ghi chú/nhu cầu ghép từ các cột', async () => {
    const { service, prisma } = setup();
    const res = await service.importSignalRows([row()], 2026, admin);
    expect(res).toMatchObject({
      success: 1,
      ordersCreated: 0,
      failed: 0,
      newSalesAccounts: [],
    });
    expect(prisma.lead.create.mock.calls[0][0].data).toMatchObject({
      date: new Date('2026-11-05'),
      websiteId: 'w1',
      customerName: 'Anh Tú',
      contact: '0912345678',
      channel: 'zalo',
      interest: 'Ly sứ - SL: 200',
      salesRepId: 'rep1',
      status: 'dang_cham_soc',
      note: 'Công ty: Cty ABC\nPhân loại KH: Doanh nghiệp\nXử lý: Đã báo giá',
    });
  });

  it('chốt đơn → lead "đã chuyển đơn" + tạo đơn hàng liên kết', async () => {
    const { service, ordersService, prisma } = setup();
    const res = await service.importSignalRows(
      [row({ tinhTrangTinHieu: 'Chốt đơn', doanhSoChotDon: '4.402.778' })],
      2026,
      admin,
    );
    expect(res.ordersCreated).toBe(1);
    expect(prisma.lead.create.mock.calls[0][0].data.status).toBe(
      'da_chuyen_don',
    );
    expect(ordersService.create.mock.calls[0][0]).toMatchObject({
      leadId: 'lead1',
      value: 4402778,
      product: 'Ly sứ',
    });
  });

  it('chốt đơn nhưng thiếu doanh số → vẫn tạo lead, báo lỗi không tạo đơn', async () => {
    const { service, ordersService } = setup();
    const res = await service.importSignalRows(
      [row({ tinhTrangTinHieu: 'chốt đơn', doanhSoChotDon: '' })],
      2026,
      admin,
    );
    expect(res.success).toBe(1);
    expect(ordersService.create).not.toHaveBeenCalled();
    expect(res.errors[0]).toContain('chưa tạo đơn hàng');
  });

  it('từ chối → lead huỷ; thiếu tên KH dùng tên công ty, thiếu cả hai dùng "-"', async () => {
    const { service, prisma } = setup();
    await service.importSignalRows(
      [
        row({ tinhTrangTinHieu: 'Khách từ chối', tenKhachHang: '' }),
        row({
          tenKhachHang: '',
          tenCongTy: '',
          sanPham: '',
          soLuong: '',
          phanLoaiKh: '',
          xuLy: '',
        }),
      ],
      2026,
      admin,
    );
    const [first, second] = prisma.lead.create.mock.calls.map((c) => c[0].data);
    expect(first).toMatchObject({ status: 'huy', customerName: 'Cty ABC' });
    expect(second).toMatchObject({
      customerName: '-',
      interest: '-',
      note: undefined,
    });
  });

  it('KD phụ trách chưa có tài khoản → tự tạo sales (1 lần cho nhiều dòng), email không trùng', async () => {
    const { service, usersService } = setup();
    const res = await service.importSignalRows(
      [
        row({ kdPhuTrach: 'Thuỳ Linh' }),
        row({ kdPhuTrach: 'thuỳ linh' }),
        row({ kdPhuTrach: 'Oanh ' }),
      ],
      2026,
      admin,
    );
    expect(usersService.invite).toHaveBeenCalledTimes(1);
    expect(usersService.invite.mock.calls[0][0]).toMatchObject({
      name: 'Thuỳ Linh',
      email: 'thuylinh@leadstracking.local',
      role: 'sales',
    });
    expect(res.newSalesAccounts).toEqual([
      {
        name: 'Thuỳ Linh',
        email: 'thuylinh@leadstracking.local',
        tempPassword: expect.any(String),
      },
    ]);
  });

  it('email tự sinh trùng người đã có → thêm hậu tố', async () => {
    const { service, usersService, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'x', name: 'Oanh Nguyễn', email: 'oanh@leadstracking.local' },
    ]);
    await service.importSignalRows([row({ kdPhuTrach: 'Oanh' })], 2026, admin);
    expect(usersService.invite.mock.calls[0][0].email).toBe(
      'oanh.1@leadstracking.local',
    );
  });

  it('báo lỗi theo số dòng của file gốc (tính cả header)', async () => {
    const { service } = setup();
    const res = await service.importSignalRows(
      [
        row({ ngay: '2026-11-05' }),
        row({ nguon: 'Khác' }),
        row({ kenh: 'Fax' }),
        row({ kdPhuTrach: ' ' }),
      ],
      2026,
      admin,
    );
    expect(res.success).toBe(0);
    expect(res.errors).toEqual([
      'Dòng 2: ngày "2026-11-05" không đúng định dạng DD.MM',
      'Dòng 3: không xác định được website từ Nguồn "Khác"',
      'Dòng 4: Kênh "Fax" không hợp lệ',
      'Dòng 5: thiếu KD phụ trách',
    ]);
  });
});
