import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { AccountEmailService } from './account-email.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const me: JwtPayload = {
  sub: 'u1',
  email: 'a@x.vn',
  role: 'sales',
  team: null,
};

function setup() {
  const authService = {
    login: vi
      .fn()
      .mockResolvedValue({
        id: 'u1',
        name: 'Mai',
        email: 'a@x.vn',
        role: 'sales',
        team: null,
        passwordHash: 'h',
      }),
    signToken: vi.fn().mockReturnValue('jwt.token'),
    me: vi.fn(),
    changeOwnPassword: vi.fn(),
    updateNotificationSettings: vi.fn(),
  };
  const accountEmail = {
    sendVerification: vi.fn(),
    confirmEmail: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  };
  const controller = new AuthController(
    authService as unknown as AuthService,
    accountEmail as unknown as AccountEmailService,
  );
  return { controller, authService, accountEmail };
}

describe('AuthController', () => {
  it('login: đặt cookie httpOnly/secure 12h và không trả passwordHash', async () => {
    const { controller } = setup();
    const res = { cookie: vi.fn() };
    const body = await controller.login(
      { email: 'a@x.vn', password: 'p' },
      res as never,
    );
    expect(body).toEqual({
      id: 'u1',
      name: 'Mai',
      email: 'a@x.vn',
      role: 'sales',
      team: null,
    });
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'jwt.token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000,
    });
  });

  it('logout: xoá cookie với cùng tuỳ chọn', () => {
    const { controller } = setup();
    const res = { clearCookie: vi.fn() };
    expect(controller.logout(res as never)).toEqual({ ok: true });
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('các route tài khoản dùng id từ JWT, không nhận id từ body', () => {
    const { controller, authService, accountEmail } = setup();
    controller.me(me);
    controller.changePassword(me, {
      currentPassword: 'a',
      newPassword: 'bbbbbbbb',
    });
    controller.updateNotificationSettings(me, { notifyTickets: false });
    controller.sendVerification(me);
    expect(authService.me).toHaveBeenCalledWith('u1');
    expect(authService.changeOwnPassword).toHaveBeenCalledWith(
      'u1',
      'a',
      'bbbbbbbb',
    );
    expect(authService.updateNotificationSettings).toHaveBeenCalledWith('u1', {
      notifyTickets: false,
    });
    expect(accountEmail.sendVerification).toHaveBeenCalledWith('u1');
  });

  it('các route qua link email chuyển token/email cho service', () => {
    const { controller, accountEmail } = setup();
    controller.confirmEmail({ token: 't1' });
    controller.forgotPassword({ email: 'a@x.vn' });
    controller.resetPassword({ token: 't2', newPassword: 'newpass123' });
    expect(accountEmail.confirmEmail).toHaveBeenCalledWith('t1');
    expect(accountEmail.forgotPassword).toHaveBeenCalledWith('a@x.vn');
    expect(accountEmail.resetPassword).toHaveBeenCalledWith('t2', 'newpass123');
  });
});
