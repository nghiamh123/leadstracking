import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import type { LeadsService } from './leads.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const admin: JwtPayload = {
  sub: 'adm',
  email: 'a@x.vn',
  role: 'admin',
  team: null,
};
const file = (text: string) =>
  ({ buffer: Buffer.from(text, 'utf-8') }) as Express.Multer.File;

function setup() {
  const service = {
    findAll: vi.fn().mockResolvedValue([]),
    findHistory: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    importRows: vi.fn().mockResolvedValue({ success: 1 }),
    importSignalRows: vi.fn().mockResolvedValue({ success: 1 }),
  };
  return {
    controller: new LeadsController(service as unknown as LeadsService),
    service,
  };
}

describe('LeadsController', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('phân quyền: sales xem/nhập lead, chỉ admin/manager import file tín hiệu', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LeadsController)).toEqual([
      'admin',
      'manager',
      'sales',
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, LeadsController.prototype.importSignal),
    ).toEqual(['admin', 'manager']);
    expect(
      Reflect.getMetadata(ROLES_KEY, LeadsController.prototype.importSignalUrl),
    ).toEqual(['admin', 'manager']);
  });

  it('đổi query string sang số cho phân trang', async () => {
    const { controller, service } = setup();
    await controller.findAll(admin, 'w1', 'moi', 'rep1', 'mai', '2', '25');
    await controller.findAll(admin);
    expect(service.findAll.mock.calls[0][1]).toEqual({
      websiteId: 'w1',
      status: 'moi',
      salesRepId: 'rep1',
      search: 'mai',
      page: 2,
      pageSize: 25,
    });
    expect(service.findAll.mock.calls[1][1]).toMatchObject({
      page: undefined,
      pageSize: undefined,
    });
  });

  it('template CSV có đúng cột theo thứ tự import', () => {
    const { controller } = setup();
    const res = { type: vi.fn().mockReturnThis(), send: vi.fn() };
    controller.template(res as never);
    expect(res.type).toHaveBeenCalledWith('text/csv');
    expect(res.send).toHaveBeenCalledWith(
      'Ngày,Website,Họ tên,SĐT,Kênh,Nhu cầu,Sales,Trạng thái,Ghi chú',
    );
  });

  it('import CSV theo vị trí cột, bỏ dòng header', async () => {
    const { controller, service } = setup();
    await controller.import(
      file(
        'Ngày,Website,Họ tên,SĐT,Kênh,Nhu cầu,Sales\n2026-11-01,Gốm Sứ,Mai,0912345678,zalo,Ly,Oanh\n',
      ),
      admin,
    );
    expect(service.importRows.mock.calls[0][0]).toEqual([
      {
        date: '2026-11-01',
        websiteName: 'Gốm Sứ',
        customerName: 'Mai',
        contact: '0912345678',
        channel: 'zalo',
        interest: 'Ly',
        salesRepName: 'Oanh',
        status: undefined,
        note: undefined,
      },
    ]);
  });

  it('import file tín hiệu: khớp theo tên cột, bắt buộc year hợp lệ', async () => {
    const { controller, service } = setup();
    await expect(
      controller.importSignal(file('Ngày\n5.11\n'), 'abc', admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.importSignal(file('Ngày\n5.11\n'), '1999', admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    await controller.importSignal(
      file('Ngày,Nguồn,KD Phụ trách\n 5.11 ,SXGS,Oanh\n'),
      '2026',
      admin,
    );
    expect(service.importSignalRows).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          ngay: '5.11',
          nguon: 'SXGS',
          kdPhuTrach: 'Oanh',
        }),
      ],
      2026,
      admin,
    );
  });

  it('import tín hiệu từ link: link hỏng → 400 kèm lý do', async () => {
    const { controller, service } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    await expect(
      controller.importSignalUrl({ url: 'https://x', year: 2026 }, admin),
    ).rejects.toThrow(/HTTP 403/);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('Ngày,Nguồn\n5.11,SXGS\n'),
        }),
    );
    await controller.importSignalUrl({ url: 'https://x', year: 2026 }, admin);
    expect(service.importSignalRows.mock.calls[0][1]).toBe(2026);
  });

  it('các route còn lại chuyển thẳng cho service kèm user', async () => {
    const { controller, service } = setup();
    await controller.history('l1', admin);
    await controller.create({} as never, admin);
    await controller.update('l1', {} as never, admin);
    await controller.remove('l1', admin);
    expect(service.findHistory).toHaveBeenCalledWith('l1', admin);
    expect(service.create).toHaveBeenCalledWith({}, admin);
    expect(service.update).toHaveBeenCalledWith('l1', {}, admin);
    expect(service.remove).toHaveBeenCalledWith('l1', admin);
  });
});
