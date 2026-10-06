import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketsService, detectImageType } from './tickets.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const sales: JwtPayload = { sub: 'rep1', email: 's@x.vn', role: 'sales', team: null };
const admin: JwtPayload = { sub: 'dev1', email: 'd@x.vn', role: 'admin', team: null };

function setup(opts: { ticket?: Record<string, unknown> | null; assignee?: Record<string, unknown> | null } = {}) {
  const ticket =
    opts.ticket === undefined ? { id: 't1', status: 'open', createdById: 'rep1', resolvedAt: null, images: [] } : opts.ticket;
  const prisma = {
    ticket: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([{ status: 'open', _count: { _all: 3 } }]),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(ticket),
      findUnique: vi.fn().mockResolvedValue(ticket),
      create: vi.fn(({ data }) => ({ id: 't1', ...data })),
      update: vi.fn(({ data }) => data),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      delete: vi.fn(),
    },
    ticketImage: {
      create: vi.fn(({ data }) => ({ id: 'i1', ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: 'i1', ticketId: 't1', mimeType: 'image/png', size: 12, data: Buffer.alloc(12) }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ticketComment: { create: vi.fn(({ data }) => ({ id: 'c1', ...data })) },
    website: { findUnique: vi.fn().mockResolvedValue({ id: 'w1' }) },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opts.assignee === undefined ? { id: 'dev1', role: 'admin', status: 'active' } : opts.assignee),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return { service: new TicketsService(prisma as unknown as PrismaService), prisma };
}

describe('TicketsService', () => {
  it('ghi bộ phận = role người tạo', async () => {
    const { service, prisma } = setup();
    await service.create(sales, { title: '  Lỗi form  ', description: 'Không gửi được' });
    expect(prisma.ticket.create.mock.calls[0][0].data).toMatchObject({
      title: 'Lỗi form',
      department: 'sales',
      createdById: 'rep1',
    });
  });

  it('không-admin chỉ thấy ticket của mình, admin thấy tất cả', async () => {
    const a = setup();
    await a.service.findAll(sales, { status: 'open' });
    expect(a.prisma.ticket.findMany.mock.calls[0][0].where.AND).toContainEqual({ createdById: 'rep1' });

    const b = setup();
    await b.service.findAll(admin, {});
    expect(b.prisma.ticket.findMany.mock.calls[0][0].where.AND).not.toContainEqual({ createdById: 'dev1' });
  });

  it('bộ lọc không ghi đè phạm vi; số theo tab bỏ qua lọc trạng thái', async () => {
    const { service, prisma } = setup();
    const res = await service.findAll(sales, { status: 'closed', department: 'admin' });
    expect(prisma.ticket.findMany.mock.calls[0][0].where.AND).toContainEqual({ createdById: 'rep1' });
    expect(prisma.ticket.groupBy.mock.calls[0][0].where.AND).not.toContainEqual({ status: 'closed' });
    expect(res.statusCounts).toEqual({ open: 3, in_progress: 0, resolved: 0, closed: 0 });
  });

  it('tìm theo mã #12 hoặc tiêu đề', async () => {
    const { service, prisma } = setup();
    await service.findAll(admin, { search: '#12' });
    const cond = prisma.ticket.findMany.mock.calls[0][0].where.AND.find((c: { OR?: unknown }) => c.OR);
    expect(cond.OR).toContainEqual({ number: 12 });
  });

  it('ticket của người khác không xem được', async () => {
    const { service } = setup({ ticket: null });
    await expect(service.findOne(sales, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addComment(sales, 'x', 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('người tạo không được gán người xử lý hay chuyển sang đang xử lý/đã xong', async () => {
    const { service, prisma } = setup();
    await expect(service.update(sales, 't1', { assigneeId: 'dev1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(sales, 't1', { status: 'resolved' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(sales, 't1', { status: 'in_progress' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('người tạo không kéo ticket dev đang xử lý về Mới, nhưng mở lại được khi đã xong/đóng', async () => {
    const busy = setup({ ticket: { id: 't1', status: 'in_progress', createdById: 'rep1', resolvedAt: null, images: [] } });
    await expect(busy.service.update(sales, 't1', { status: 'open' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(busy.prisma.ticket.update).not.toHaveBeenCalled();

    for (const status of ['resolved', 'closed']) {
      const done = setup({ ticket: { id: 't1', status, createdById: 'rep1', resolvedAt: new Date(), images: [] } });
      await done.service.update(sales, 't1', { status: 'open' });
      expect(done.prisma.ticket.update.mock.calls[0][0].data).toMatchObject({ status: 'open', resolvedAt: null });
    }
  });

  it('người tạo chỉ sửa nội dung khi dev chưa nhận, nhưng luôn đóng/mở lại được', async () => {
    const { service, prisma } = setup({ ticket: { id: 't1', status: 'in_progress', createdById: 'rep1' } });
    await expect(service.update(sales, 't1', { title: 'Đổi tiêu đề' })).rejects.toBeInstanceOf(ForbiddenException);
    await service.update(sales, 't1', { status: 'closed', title: undefined });
    expect(prisma.ticket.update.mock.calls[0][0].data.status).toBe('closed');
  });

  it('admin: gán người xử lý phải là admin đang hoạt động; "" = bỏ gán', async () => {
    const bad = setup({ assignee: { id: 'u2', role: 'sales', status: 'active' } });
    await expect(bad.service.update(admin, 't1', { assigneeId: 'u2' })).rejects.toBeInstanceOf(BadRequestException);

    const ok = setup();
    await ok.service.update(admin, 't1', { assigneeId: '' });
    expect(ok.prisma.ticket.update.mock.calls[0][0].data.assigneeId).toBeNull();
  });

  it('ghi resolvedAt khi xong, xoá khi mở lại', async () => {
    const { service, prisma } = setup();
    await service.update(admin, 't1', { status: 'resolved' });
    expect(prisma.ticket.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
    await service.update(admin, 't1', { status: 'open' });
    expect(prisma.ticket.update.mock.calls[1][0].data.resolvedAt).toBeNull();
  });

  it('bình luận gắn đúng người, cắt khoảng trắng và cập nhật ticket', async () => {
    const { service, prisma } = setup();
    await service.addComment(admin, 't1', '  đã fix  ');
    expect(prisma.ticketComment.create.mock.calls[0][0].data).toEqual({ ticketId: 't1', userId: 'dev1', body: 'đã fix' });
    expect(prisma.ticket.update).toHaveBeenCalled();
  });

  it('closed trực tiếp cũng đặt mốc hoàn thành; resolved -> closed giữ mốc cũ', async () => {
    const direct = setup();
    await direct.service.update(sales, 't1', { status: 'closed' });
    expect(direct.prisma.ticket.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);

    const doneAt = new Date('2026-10-01T00:00:00Z');
    const later = setup({ ticket: { id: 't1', status: 'resolved', createdById: 'rep1', resolvedAt: doneAt, images: [] } });
    await later.service.update(sales, 't1', { status: 'closed' });
    expect(later.prisma.ticket.update.mock.calls[0][0].data.resolvedAt).toBe(doneAt);
  });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const DAY = 86_400_000;

describe('TicketsService - ảnh đính kèm', () => {
  it('nhận diện định dạng theo magic bytes, từ chối SVG/HTML giả ảnh', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
  });

  it('lưu ảnh với mime theo nội dung (không tin tên file), gắn người tải lên', async () => {
    const { service, prisma } = setup();
    await service.addImage(sales, 't1', { originalname: 'shot.html', buffer: PNG });
    expect(prisma.ticketImage.create.mock.calls[0][0].data).toMatchObject({
      ticketId: 't1',
      uploadedById: 'rep1',
      mimeType: 'image/png',
      size: PNG.length,
    });
  });

  it('từ chối file không phải ảnh, quá 5 ảnh, hoặc ticket đã hoàn thành', async () => {
    const bad = setup();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(bad.service.addImage(sales, 't1', { originalname: 'a.svg', buffer: svg })).rejects.toBeInstanceOf(BadRequestException);
    await expect(bad.service.addImage(sales, 't1', undefined)).rejects.toBeInstanceOf(BadRequestException);

    const full = setup({ ticket: { id: 't1', status: 'open', createdById: 'rep1', resolvedAt: null, images: Array.from({ length: 5 }, () => ({})) } });
    await expect(full.service.addImage(sales, 't1', { originalname: 'a.png', buffer: PNG })).rejects.toBeInstanceOf(BadRequestException);

    const done = setup({ ticket: { id: 't1', status: 'resolved', createdById: 'rep1', resolvedAt: new Date(), images: [] } });
    await expect(done.service.addImage(sales, 't1', { originalname: 'a.png', buffer: PNG })).rejects.toBeInstanceOf(BadRequestException);
    expect(done.prisma.ticketImage.create).not.toHaveBeenCalled();
  });

  it('chỉ xem/xoá ảnh của ticket trong phạm vi quyền', async () => {
    const { service, prisma } = setup({ ticket: null });
    await expect(service.getImage(sales, 'x', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeImage(sales, 'x', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.ticketImage.deleteMany).not.toHaveBeenCalled();
  });

  it('cron xoá ảnh ticket hoàn thành quá 3 ngày rồi đánh dấu đã xoá', async () => {
    const { service, prisma } = setup();
    prisma.ticket.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    prisma.ticketImage.deleteMany.mockResolvedValue({ count: 4 });
    const res = await service.purgeExpiredImages();

    const where = prisma.ticket.findMany.mock.calls[0][0].where;
    expect(Math.abs(Date.now() - where.resolvedAt.lt.getTime() - 3 * DAY)).toBeLessThan(5000);
    expect(where.images).toEqual({ some: {} });
    expect(prisma.ticketImage.deleteMany.mock.calls[0][0].where).toEqual({ ticketId: { in: ['t1', 't2'] } });
    expect(prisma.ticket.updateMany.mock.calls[0][0].data.imagesPurgedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ tickets: 2, images: 4 });
  });

  it('cron không làm gì khi không có ticket hết hạn', async () => {
    const { service, prisma } = setup();
    prisma.ticket.findMany.mockResolvedValue([]);
    expect(await service.purgeExpiredImages()).toEqual({ tickets: 0, images: 0 });
    expect(prisma.ticketImage.deleteMany).not.toHaveBeenCalled();
  });
});
