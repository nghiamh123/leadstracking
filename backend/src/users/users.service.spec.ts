import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccountEmailService } from '../auth/account-email.service.js';

function setup(
  opts: { existing?: Record<string, unknown> | null; sendFails?: boolean } = {},
) {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      create: vi.fn(({ data }) => ({ id: 'new1', ...data })),
      update: vi.fn(({ data }) => data),
    },
  };
  const accountEmail = {
    sendVerification: opts.sendFails
      ? vi.fn().mockRejectedValue(new Error('smtp down'))
      : vi.fn().mockResolvedValue({ ok: true }),
  };
  return {
    service: new UsersService(
      prisma as unknown as PrismaService,
      accountEmail as unknown as AccountEmailService,
    ),
    prisma,
    accountEmail,
  };
}

const dto = {
  name: 'Mai',
  email: 'mai@x.vn',
  role: 'sales' as const,
  password: 'initial-pass',
};

describe('UsersService', () => {
  it('danh sách không bao giờ trả passwordHash', async () => {
    const { service, prisma } = setup();
    await service.findAll();
    const select = prisma.user.findMany.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.emailVerifiedAt).toBe(true);
  });

  it('mời người dùng: hash mật khẩu, đặt active, gửi email xác minh', async () => {
    const { service, prisma, accountEmail } = setup();
    await service.invite(dto);
    const { data, select } = prisma.user.create.mock.calls[0][0];
    expect(data.status).toBe('active');
    expect(await bcrypt.compare('initial-pass', data.passwordHash)).toBe(true);
    expect(select.passwordHash).toBeUndefined();
    expect(accountEmail.sendVerification).toHaveBeenCalledWith('new1');
  });

  it('gửi email xác minh lỗi vẫn tạo được tài khoản', async () => {
    const { service } = setup({ sendFails: true });
    await expect(service.invite(dto)).resolves.toMatchObject({ id: 'new1' });
  });

  it('email đã có tài khoản → 409', async () => {
    const { service, prisma } = setup({ existing: { id: 'u0' } });
    await expect(service.invite(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('đổi vai trò / trạng thái / đặt lại mật khẩu / gửi lại xác minh cho user tồn tại', async () => {
    const { service, prisma, accountEmail } = setup({ existing: { id: 'u1' } });
    await service.updateRole('u1', 'manager');
    await service.updateStatus('u1', 'disabled');
    expect(prisma.user.update.mock.calls.map((c) => c[0].data)).toEqual([
      { role: 'manager' },
      { status: 'disabled' },
    ]);

    await expect(
      service.resetPassword('u1', 'brand-new-pass'),
    ).resolves.toEqual({ ok: true });
    expect(
      await bcrypt.compare(
        'brand-new-pass',
        prisma.user.update.mock.calls[2][0].data.passwordHash,
      ),
    ).toBe(true);

    await service.sendVerification('u1');
    expect(accountEmail.sendVerification).toHaveBeenCalledWith('u1');
  });

  it.each([
    'updateRole',
    'updateStatus',
    'resetPassword',
    'sendVerification',
  ] as const)('%s với user không tồn tại → 404', async (method) => {
    const { service } = setup();
    const call = service[method] as (
      id: string,
      arg: string,
    ) => Promise<unknown>;
    await expect(call.call(service, 'x', 'sales')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
