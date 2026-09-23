import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowupsService } from './followups.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const sales: JwtPayload = { sub: 'rep1', email: 's@x.vn', role: 'sales', team: null };
const tomorrow = () => new Date(Date.now() + 86_400_000);

function setup(opts: { leadFound?: boolean; reminderFound?: boolean } = {}) {
  const prisma = {
    lead: {
      findFirst: vi.fn().mockResolvedValue(opts.leadFound === false ? null : { id: 'l1', customerName: 'Chị Mai' }),
      update: vi.fn((args) => args),
    },
    leadActivity: { create: vi.fn((args) => ({ id: 'a1', ...args.data })) },
    reminder: {
      create: vi.fn(({ data }) => ({ id: 'r1', ...data })),
      findFirst: vi.fn().mockResolvedValue(opts.reminderFound === false ? null : { id: 'r1', userId: 'rep1' }),
      update: vi.fn(({ data }) => data),
      delete: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return { service: new FollowupsService(prisma as unknown as PrismaService), prisma };
}

describe('FollowupsService', () => {
  it('chỉ thao tác trên lead trong quyền xem', async () => {
    const { service, prisma } = setup({ leadFound: false });
    await expect(service.createReminder(sales, 'l-khac', { dueAt: tomorrow(), note: 'gọi lại' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.lead.findFirst.mock.calls[0][0].where.AND).toContainEqual({ salesRepId: 'rep1' });
    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('tạo lịch nhắc cho chính người tạo, ghi nguồn', async () => {
    const { service, prisma } = setup();
    const res = await service.createReminder(sales, 'l1', { dueAt: tomorrow(), note: '  gọi chị Mai  ', source: 'assistant' });
    expect(prisma.reminder.create.mock.calls[0][0].data).toMatchObject({
      leadId: 'l1',
      userId: 'rep1',
      note: 'gọi chị Mai',
      source: 'assistant',
    });
    expect(res.lead.customerName).toBe('Chị Mai');
  });

  it('không cho đặt lịch nhắc vào ngày đã qua hoặc quá xa', async () => {
    const { service } = setup();
    await expect(
      service.createReminder(sales, 'l1', { dueAt: new Date(Date.now() - 3 * 86_400_000), note: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createReminder(sales, 'l1', { dueAt: new Date(Date.now() + 400 * 86_400_000), note: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ghi lần liên hệ cập nhật luôn updatedAt của lead', async () => {
    const { service, prisma } = setup();
    await service.logActivity(sales, 'l1', { type: 'call', note: 'Khách hẹn thứ 6' });
    expect(prisma.leadActivity.create.mock.calls[0][0].data).toMatchObject({ leadId: 'l1', userId: 'rep1', type: 'call' });
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { updatedAt: expect.any(Date) } });
  });

  it('không cho ghi lần liên hệ ở tương lai', async () => {
    const { service } = setup();
    await expect(service.logActivity(sales, 'l1', { type: 'call', happenedAt: tomorrow() })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('chỉ chủ lịch nhắc mới sửa/xoá được', async () => {
    const { service, prisma } = setup({ reminderFound: false });
    await expect(service.updateReminder(sales, 'r-khac', { done: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteReminder(sales, 'r-khac')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.reminder.findFirst.mock.calls[0][0].where).toEqual({ id: 'r-khac', userId: 'rep1' });
  });

  it('đánh dấu xong / mở lại', async () => {
    const { service, prisma } = setup();
    await service.updateReminder(sales, 'r1', { done: true });
    expect(prisma.reminder.update.mock.calls[0][0].data.doneAt).toBeInstanceOf(Date);
    await service.updateReminder(sales, 'r1', { done: false });
    expect(prisma.reminder.update.mock.calls[1][0].data.doneAt).toBeNull();
  });
});
