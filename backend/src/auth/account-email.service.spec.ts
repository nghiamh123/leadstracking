import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, HttpException } from '@nestjs/common';
import { AccountEmailService, hashToken } from './account-email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MailService } from '../notifications/mail.service.js';

const user = {
  id: 'u1',
  name: 'Mai',
  email: 'mai@x.vn',
  status: 'active',
  emailVerifiedAt: null,
  passwordHash: 'old',
};

function setup(
  opts: {
    user?: Record<string, unknown> | null;
    recent?: boolean;
    token?: Record<string, unknown> | null;
  } = {},
) {
  const u = opts.user === undefined ? user : opts.user;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(u),
      findUniqueOrThrow: vi.fn().mockResolvedValue(u),
      update: vi.fn(({ data }) => ({ email: 'mai@x.vn', ...data })),
    },
    emailToken: {
      create: vi.fn(({ data }) => data),
      findFirst: vi.fn().mockResolvedValue(opts.recent ? { id: 'e0' } : null),
      findUnique: vi.fn().mockResolvedValue(opts.token ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const mail = {
    send: vi.fn().mockResolvedValue(true),
    appUrl: (p: string) => `https://app.test${p}`,
  };
  return {
    service: new AccountEmailService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
    ),
    prisma,
    mail,
  };
}

const linkToken = (text: string) =>
  /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

describe('AccountEmailService - xác minh email', () => {
  it('gửi link chứa token; DB chỉ lưu hash của token', async () => {
    const { service, prisma, mail } = setup();
    await service.sendVerification('u1');
    const token = linkToken(mail.send.mock.calls[0][0].text);
    expect(token.length).toBeGreaterThan(30);
    const saved = prisma.emailToken.create.mock.calls[0][0].data;
    expect(saved.tokenHash).toBe(hashToken(token));
    expect(saved.tokenHash).not.toContain(token);
    expect(saved.type).toBe('verify_email');
  });

  it('đã xác minh thì không gửi nữa', async () => {
    const { service, mail } = setup({
      user: { ...user, emailVerifiedAt: new Date() },
    });
    expect(await service.sendVerification('u1')).toEqual({
      ok: true,
      alreadyVerified: true,
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('chặn gửi lại trong vòng 1 phút', async () => {
    const { service } = setup({ recent: true });
    await expect(service.sendVerification('u1')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('xác nhận token hợp lệ thì đánh dấu emailVerifiedAt', async () => {
    const { service, prisma } = setup({
      token: {
        id: 'e1',
        userId: 'u1',
        type: 'verify_email',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(service.confirmEmail('abc')).resolves.toMatchObject({
      ok: true,
    });
    expect(prisma.emailToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('abc') },
    });
    expect(
      prisma.user.update.mock.calls[0][0].data.emailVerifiedAt,
    ).toBeInstanceOf(Date);
  });

  it.each([
    ['không tồn tại', null],
    [
      'đã dùng',
      {
        id: 'e1',
        userId: 'u1',
        type: 'verify_email',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
    [
      'hết hạn',
      {
        id: 'e1',
        userId: 'u1',
        type: 'verify_email',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      },
    ],
    [
      'sai loại',
      {
        id: 'e1',
        userId: 'u1',
        type: 'reset_password',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  ])('từ chối token %s', async (_label, token) => {
    const { service, prisma } = setup({ token });
    await expect(service.confirmEmail('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('2 request dùng cùng token đồng thời: chỉ 1 thành công', async () => {
    const { service, prisma } = setup({
      token: {
        id: 'e1',
        userId: 'u1',
        type: 'verify_email',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    prisma.emailToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirmEmail('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountEmailService - quên mật khẩu', () => {
  it('email không tồn tại vẫn trả ok và không gửi gì', async () => {
    const { service, mail, prisma } = setup({ user: null });
    expect(await service.forgotPassword('nobody@x.vn')).toEqual({ ok: true });
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.emailToken.create).not.toHaveBeenCalled();
  });

  it('tài khoản bị khoá hoặc vừa gửi: trả ok, không gửi', async () => {
    for (const opts of [
      { user: { ...user, status: 'disabled' } },
      { recent: true },
    ]) {
      const { service, mail } = setup(opts);
      expect(await service.forgotPassword('mai@x.vn')).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    }
  });

  it('gửi link đặt lại mật khẩu', async () => {
    const { service, mail } = setup();
    await service.forgotPassword('mai@x.vn');
    expect(mail.send.mock.calls[0][0].text).toContain(
      'https://app.test/reset-password?token=',
    );
  });

  it('đặt lại mật khẩu: đổi hash, xác minh email, huỷ các link khác', async () => {
    const { service, prisma } = setup({
      token: {
        id: 'e1',
        userId: 'u1',
        type: 'reset_password',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await service.resetPassword('abc', 'newpassword123');
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).not.toBe('old');
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.emailToken.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', type: 'reset_password', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
});
