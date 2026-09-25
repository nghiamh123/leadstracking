import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { HostingsService } from './hostings.service.js';
import { decryptSecret, encryptSecret, parseSecretKey } from '../common/secret-box.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const KEY_HEX = 'a'.repeat(64);
const admin: JwtPayload = { sub: 'u1', email: 'admin@x.vn', role: 'admin', team: null };

function setup(keyHex: string = KEY_HEX) {
  let stored: Record<string, unknown> | null = null;
  const prisma = {
    website: { findUnique: vi.fn().mockResolvedValue({ id: 'w1' }) },
    hostingAccount: {
      create: vi.fn(({ data }) => {
        stored = { id: 'h1', ...data };
        return stored;
      }),
      findUnique: vi.fn(() => stored),
      update: vi.fn(({ data }) => ({ ...stored, ...data })),
    },
  };
  const config = { get: vi.fn(() => keyHex) } as unknown as ConfigService;
  return { service: new HostingsService(prisma as unknown as PrismaService, config), prisma };
}

describe('secret-box', () => {
  it('mã hoá rồi giải mã ra đúng chuỗi gốc, mỗi lần một IV khác nhau', () => {
    const key = parseSecretKey(KEY_HEX)!;
    const a = encryptSecret('Mật-khẩu#123', key);
    expect(a).not.toContain('Mật-khẩu');
    expect(a).not.toEqual(encryptSecret('Mật-khẩu#123', key));
    expect(decryptSecret(a, key)).toBe('Mật-khẩu#123');
  });

  it('sai key thì không giải mã được', () => {
    const enc = encryptSecret('secret', parseSecretKey(KEY_HEX)!);
    expect(() => decryptSecret(enc, parseSecretKey('b'.repeat(64))!)).toThrow();
  });

  it('từ chối key không đủ 32 byte', () => {
    expect(parseSecretKey('abc')).toBeNull();
    expect(parseSecretKey(undefined)).toBeNull();
  });
});

describe('HostingsService', () => {
  it('lưu mật khẩu đã mã hoá, không trả mật khẩu trong kết quả, xem lại được qua reveal', async () => {
    const { service, prisma } = setup();
    const created = await service.create({ websiteId: 'w1', loginUrl: 'https://host.vn:2083', password: 'p@ss' });

    const data = prisma.hostingAccount.create.mock.calls[0][0].data;
    expect(data.passwordEncrypted).not.toContain('p@ss');
    expect(created).not.toHaveProperty('passwordEncrypted');
    expect(created).toMatchObject({ hasPassword: true });

    await expect(service.revealPassword('h1', admin)).resolves.toEqual({ password: 'p@ss' });
  });

  it('cập nhật không gửi password thì giữ nguyên, gửi rỗng thì xoá', async () => {
    const { service, prisma } = setup();
    await service.create({ websiteId: 'w1', loginUrl: 'https://host.vn', password: 'p' });

    await service.update('h1', { note: 'ghi chú' });
    expect(prisma.hostingAccount.update.mock.calls[0][0].data.passwordEncrypted).toBeUndefined();

    await service.update('h1', { password: '' });
    expect(prisma.hostingAccount.update.mock.calls[1][0].data.passwordEncrypted).toBeNull();
  });

  it('chưa cấu hình key thì báo lỗi rõ ràng khi lưu mật khẩu', async () => {
    const { service } = setup('');
    await expect(
      service.create({ websiteId: 'w1', loginUrl: 'https://host.vn', password: 'p' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
