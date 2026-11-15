import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LoginEventsService } from './login-events.service.js';
import { GeoIpService, isPrivateIp, type GeoInfo } from './geo-ip.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const geo: GeoInfo = {
  countryCode: 'VN',
  country: 'Vietnam',
  region: 'Hanoi',
  city: 'Hanoi',
  isp: 'Viettel',
  asn: 'AS7552',
  latitude: 21,
  longitude: 105,
};

function setup(
  opts: { known?: unknown; geoResult?: GeoInfo | null; user?: unknown } = {},
) {
  const prisma = {
    website: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'w1', domain: 'https://www.GomSu.vn/' }]),
    },
    user: { findFirst: vi.fn().mockResolvedValue(opts.user ?? null) },
    loginEvent: {
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
      findFirst: vi.fn().mockResolvedValue(opts.known ?? null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
      groupBy: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
  };
  const geoIp = {
    lookup: vi
      .fn()
      .mockResolvedValue(opts.geoResult === undefined ? geo : opts.geoResult),
  };
  return {
    service: new LoginEventsService(
      prisma as unknown as PrismaService,
      geoIp as unknown as GeoIpService,
    ),
    prisma,
    geoIp,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LoginEventsService.ingest', () => {
  it('khớp domain sau khi chuẩn hoá cả 2 phía (bỏ https, www, path, hoa thường)', async () => {
    const { service, prisma } = setup({ user: { id: 'u1' } });
    const res = await service.ingest({
      domain: 'gomsu.vn/wp-admin',
      username: ' Admin@X.vn ',
      success: true,
      ip: '1.2.3.4',
    });
    expect(res).toEqual({ id: 'e1' });
    expect(prisma.loginEvent.create.mock.calls[0][0].data).toMatchObject({
      websiteId: 'w1',
      username: 'Admin@X.vn',
      userId: 'u1',
      success: true,
    });
  });

  it('domain lạ → 404 kèm hướng dẫn', async () => {
    const { service } = setup();
    await expect(
      service.ingest({ domain: 'khac.vn', username: 'a', success: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tra vị trí sau khi trả lời; dùng lại kết quả của lượt cũ cùng IP', async () => {
    const { service, prisma, geoIp } = setup({
      known: { ...geo, city: 'HCM' },
    });
    await service.ingest({
      domain: 'gomsu.vn',
      username: 'a',
      success: true,
      ip: '1.2.3.4',
      occurredAt: '2026-11-01T00:00:00Z',
    });
    await flush();
    expect(geoIp.lookup).not.toHaveBeenCalled();
    expect(prisma.loginEvent.update.mock.calls[0][0].data).toMatchObject({
      city: 'HCM',
      geoCheckedAt: expect.any(Date),
    });
  });

  it('IP mới → gọi GeoIP; tra thất bại thì để trống cho cron tra bù', async () => {
    const ok = setup();
    await ok.service.ingest({
      domain: 'gomsu.vn',
      username: 'a',
      success: true,
      ip: '1.2.3.4',
    });
    await flush();
    expect(ok.geoIp.lookup).toHaveBeenCalledWith('1.2.3.4');
    expect(ok.prisma.loginEvent.update).toHaveBeenCalled();

    const fail = setup({ geoResult: null });
    await fail.service.ingest({
      domain: 'gomsu.vn',
      username: 'a',
      success: true,
      ip: '1.2.3.4',
    });
    await flush();
    expect(fail.prisma.loginEvent.update).not.toHaveBeenCalled();
  });

  it('không có IP thì không tra vị trí', async () => {
    const { service, prisma } = setup();
    await service.ingest({ domain: 'gomsu.vn', username: 'a', success: true });
    await flush();
    expect(prisma.loginEvent.findFirst).not.toHaveBeenCalled();
  });
});

describe('LoginEventsService - cron + truy vấn', () => {
  it('backfillGeo cập nhật theo IP, bỏ qua IP tra lỗi', async () => {
    const { service, prisma, geoIp } = setup();
    prisma.loginEvent.findMany.mockResolvedValue([
      { ip: '1.1.1.1' },
      { ip: '2.2.2.2' },
      { ip: null },
    ]);
    geoIp.lookup.mockResolvedValueOnce(geo).mockResolvedValueOnce(null);
    await service.backfillGeo();
    expect(prisma.loginEvent.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.loginEvent.updateMany.mock.calls[0][0].where).toEqual({
      ip: '1.1.1.1',
      geoCheckedAt: null,
    });
  });

  it('findAll: lọc trong nước/nước ngoài, thành công, khoảng ngày tính hết ngày "đến"', async () => {
    const { service, prisma } = setup();
    await service.findAll({
      area: 'foreign',
      success: 'false',
      from: '2026-11-01',
      to: '2026-11-02',
      username: 'adm',
      page: 1,
    });
    const where = prisma.loginEvent.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      success: false,
      countryCode: { not: null, notIn: ['VN'] },
      username: { contains: 'adm', mode: 'insensitive' },
      occurredAt: {
        gte: new Date('2026-11-01T00:00:00+07:00'),
        lt: new Date('2026-11-03T00:00:00+07:00'),
      },
    });

    await service.findAll({ area: 'vn', success: 'true' });
    expect(prisma.loginEvent.count.mock.calls[1][0].where).toMatchObject({
      countryCode: 'VN',
      success: true,
      occurredAt: undefined,
    });
  });

  it('summary: đếm hôm nay + danh sách đăng nhập sai nhiều lần', async () => {
    const { service, prisma } = setup();
    prisma.loginEvent.findMany.mockResolvedValue([
      { username: 'a' },
      { username: 'b' },
    ]);
    prisma.loginEvent.groupBy.mockResolvedValue([
      { websiteId: 'w1', username: 'admin', _count: { _all: 7 } },
    ]);
    expect(await service.summary()).toEqual({
      successToday: 3,
      failedToday: 3,
      activeUsersToday: 2,
      suspicious: [{ websiteId: 'w1', username: 'admin', failedCount: 7 }],
    });
  });

  it('statusByWebsite + purgeOld (giữ 90 ngày)', async () => {
    const { service, prisma } = setup();
    const last = new Date('2026-11-14');
    prisma.loginEvent.groupBy.mockResolvedValue([
      { websiteId: 'w1', _max: { occurredAt: last }, _count: { _all: 9 } },
    ]);
    expect(await service.statusByWebsite()).toEqual([
      { websiteId: 'w1', lastEventAt: last, eventCount: 9 },
    ]);

    await service.purgeOld();
    const cutoff: Date =
      prisma.loginEvent.deleteMany.mock.calls[0][0].where.occurredAt.lt;
    expect(Math.round((Date.now() - cutoff.getTime()) / 86_400_000)).toBe(90);
  });
});

describe('isPrivateIp', () => {
  it.each([
    ['10.0.0.1', true],
    ['127.0.0.1', true],
    ['172.16.5.4', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.1.1', true],
    ['100.64.0.1', true],
    ['8.8.8.8', false],
    ['::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['2001:4860::8888', false],
    ['không-phải-ip', true],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('GeoIpService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('IP nội bộ: trả rỗng, không gọi mạng', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await new GeoIpService().lookup('192.168.1.1')).toMatchObject({
      countryCode: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('map kết quả ipwho.is và cache theo IP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          country: 'Vietnam',
          country_code: 'VN',
          region: 'Hanoi',
          city: 'Hanoi',
          latitude: 21,
          longitude: 105,
          connection: { asn: 7552, org: 'Viettel Group' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const svc = new GeoIpService();
    expect(await svc.lookup('8.8.8.8')).toEqual({
      ...geo,
      isp: 'Viettel Group',
    });
    await svc.lookup('8.8.8.8');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dịch vụ báo lỗi hoặc mạng lỗi → null (để thử lại sau)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: false, message: 'limit' }),
        }),
    );
    expect(await new GeoIpService().lookup('8.8.4.4')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await new GeoIpService().lookup('8.8.4.4')).toBeNull();
  });
});
