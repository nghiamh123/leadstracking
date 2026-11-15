import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

async function setup(
  user: Record<string, unknown> | null,
  password = 'right-password',
) {
  const passwordHash = await bcrypt.hash(password, 4);
  const stored = user
    ? {
        id: 'u1',
        email: 'a@x.vn',
        role: 'sales',
        team: null,
        status: 'active',
        passwordHash,
        ...user,
      }
    : null;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(stored),
      findUniqueOrThrow: vi.fn().mockResolvedValue(stored),
      update: vi.fn(({ data }) => data),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('signed.jwt') };
  return {
    service: new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    ),
    prisma,
    jwt,
  };
}

describe('AuthService.login', () => {
  it('đúng email + mật khẩu → trả user', async () => {
    const { service } = await setup({});
    await expect(
      service.login('a@x.vn', 'right-password'),
    ).resolves.toMatchObject({ id: 'u1' });
  });

  it('email không tồn tại và sai mật khẩu báo cùng 1 thông báo (không lộ email nào có tài khoản)', async () => {
    const missing = await setup(null);
    const wrong = await setup({});
    const e1 = await missing.service.login('no@x.vn', 'x').catch((e) => e);
    const e2 = await wrong.service.login('a@x.vn', 'wrong').catch((e) => e);
    expect(e1).toBeInstanceOf(UnauthorizedException);
    expect(e1.message).toBe(e2.message);
  });

  it('tài khoản bị khoá không đăng nhập được kể cả đúng mật khẩu', async () => {
    const { service } = await setup({ status: 'disabled' });
    await expect(service.login('a@x.vn', 'right-password')).rejects.toThrow(
      'Tài khoản đã bị khoá.',
    );
  });
});

describe('AuthService - mật khẩu, token, thông tin', () => {
  it('đổi mật khẩu: sai mật khẩu hiện tại → 401, không cập nhật', async () => {
    const { service, prisma } = await setup({});
    await expect(
      service.changeOwnPassword('u1', 'wrong', 'newpassword'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('đổi mật khẩu: đúng → lưu hash mới (không lưu mật khẩu thô)', async () => {
    const { service, prisma } = await setup({});
    await expect(
      service.changeOwnPassword('u1', 'right-password', 'newpassword'),
    ).resolves.toEqual({ ok: true });
    const { passwordHash } = prisma.user.update.mock.calls[0][0].data;
    expect(passwordHash).not.toBe('newpassword');
    expect(await bcrypt.compare('newpassword', passwordHash)).toBe(true);
  });

  it('signToken: payload chỉ gồm sub/email/role/team', async () => {
    const { service, jwt } = await setup({});
    expect(
      service.signToken({
        id: 'u1',
        email: 'a@x.vn',
        role: 'admin',
        team: 'HN',
      }),
    ).toBe('signed.jwt');
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'a@x.vn',
      role: 'admin',
      team: 'HN',
    });
  });

  it('me / cập nhật tuỳ chọn thông báo không bao giờ select passwordHash', async () => {
    const { service, prisma } = await setup({});
    await service.me('u1');
    await service.updateNotificationSettings('u1', {
      notifyDailyDigest: false,
    });
    expect(
      prisma.user.findUnique.mock.calls[0][0].select.passwordHash,
    ).toBeUndefined();
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.select.passwordHash).toBeUndefined();
    expect(update.select.emailVerifiedAt).toBe(true);
    expect(update.data).toEqual({
      notifyTickets: undefined,
      notifyReminders: undefined,
      notifyDailyDigest: false,
    });
  });
});
