import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { HostingsController } from './hostings.controller.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ActiveAdminGuard } from '../common/guards/active-admin.guard.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const handlers = Object.getOwnPropertyNames(HostingsController.prototype).filter((n) => n !== 'constructor');

function ctx(user: unknown, handler: () => unknown = HostingsController.prototype.findAll) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => HostingsController,
  } as unknown as ExecutionContext;
}

describe('HostingsController - chỉ admin', () => {
  it('áp guard + role admin ở cấp controller, không route nào ghi đè', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, HostingsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
      ActiveAdminGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, HostingsController)).toEqual(['admin']);
    for (const name of handlers) {
      const fn = HostingsController.prototype[name as keyof HostingsController];
      expect(Reflect.getMetadata(ROLES_KEY, fn), name).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, fn), name).toBeUndefined();
    }
  });

  it('RolesGuard chặn mọi role khác admin trên mọi route', () => {
    const guard = new RolesGuard(new Reflector());
    for (const name of handlers) {
      const fn = HostingsController.prototype[name as keyof HostingsController] as () => unknown;
      for (const role of ['manager', 'sales', 'seo']) {
        expect(guard.canActivate(ctx({ sub: 'u', role }, fn)), `${name}/${role}`).toBe(false);
      }
      expect(guard.canActivate(ctx({ sub: 'u', role: 'admin' }, fn))).toBe(true);
    }
  });

  describe('ActiveAdminGuard kiểm tra lại trong database', () => {
    const guardWith = (dbUser: unknown) =>
      new ActiveAdminGuard({
        user: { findUnique: vi.fn().mockResolvedValue(dbUser) },
      } as unknown as PrismaService);
    const adminToken = { sub: 'u1', role: 'admin' };

    it('cho qua admin đang hoạt động', async () => {
      await expect(guardWith({ role: 'admin', status: 'active' }).canActivate(ctx(adminToken))).resolves.toBe(true);
    });

    it.each([
      ['đã bị hạ quyền', { role: 'sales', status: 'active' }],
      ['đã bị khoá', { role: 'admin', status: 'disabled' }],
      ['đã bị xoá', null],
    ])('chặn token admin cũ khi user %s', async (_, dbUser) => {
      await expect(guardWith(dbUser).canActivate(ctx(adminToken))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
