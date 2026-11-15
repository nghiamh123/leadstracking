import { describe, expect, it } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { leadOrderScope } from './scope.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { LoginIngestKeyGuard } from './guards/login-ingest-key.guard.js';
import type { JwtPayload } from './types/jwt-payload.js';

const user = (
  role: JwtPayload['role'],
  team: string | null = null,
): JwtPayload => ({
  sub: 'u1',
  email: 'u@x.vn',
  role,
  team,
});

describe('leadOrderScope', () => {
  it.each([
    ['sales chỉ thấy lead của mình', user('sales'), { salesRepId: 'u1' }],
    [
      'manager có team thấy lead của cả team',
      user('manager', 'HN'),
      { salesRep: { team: 'HN' } },
    ],
    [
      'manager không có team chỉ thấy lead của mình',
      user('manager'),
      { salesRepId: 'u1' },
    ],
    ['admin thấy tất cả', user('admin'), {}],
  ])('%s', (_label, u, expected) => {
    expect(leadOrderScope(u)).toEqual(expected);
  });
});

function ctx(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => headers[name] }),
    }),
  } as unknown as ExecutionContext;
}

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe.each([
  [
    'ApiKeyGuard',
    (c: ConfigService) => new ApiKeyGuard(c),
    'GSC_INGEST_API_KEY',
  ],
  [
    'LoginIngestKeyGuard',
    (c: ConfigService) => new LoginIngestKeyGuard(c),
    'LOGIN_INGEST_API_KEY',
  ],
])('%s', (_name, make, envKey) => {
  it('cho qua khi header x-api-key khớp', () => {
    expect(
      make(config({ [envKey]: 'secret-key' })).canActivate(
        ctx({ 'x-api-key': 'secret-key' }),
      ),
    ).toBe(true);
  });

  it('chặn khi sai key, thiếu header, hoặc khác độ dài', () => {
    const guard = make(config({ [envKey]: 'secret-key' }));
    for (const provided of ['wrong-key!', undefined, 'short']) {
      expect(() => guard.canActivate(ctx({ 'x-api-key': provided }))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('chặn khi server chưa cấu hình key (không cho key rỗng lọt qua)', () => {
    const guard = make(config({}));
    expect(() => guard.canActivate(ctx({ 'x-api-key': '' }))).toThrow(
      /chưa cấu hình/,
    );
  });
});
