import { describe, expect, it, vi } from 'vitest';
import { NotificationsService, canNotify } from './notifications.service.js';
import { escapeHtml, layout } from './templates.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MailService } from './mail.service.js';

const verified = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `User ${id}`,
  email: `${id}@x.vn`,
  status: 'active',
  emailVerifiedAt: new Date('2026-11-01'),
  notifyTickets: true,
  notifyReminders: true,
  notifyDailyDigest: true,
  ...extra,
});

function setup(users: Record<string, ReturnType<typeof verified>> = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(users[where.id] ?? null),
      ),
      findMany: vi.fn().mockResolvedValue(Object.values(users)),
    },
    reminder: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    lead: { count: vi.fn().mockResolvedValue(0) },
    leadActivity: { count: vi.fn().mockResolvedValue(0) },
    notificationRun: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const mail = {
    send: vi.fn().mockResolvedValue(true),
    appUrl: (p: string) => `https://app.test${p}`,
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
  );
  return { service, prisma, mail };
}

const ticket = {
  id: 't1',
  number: 7,
  title: 'Lỗi form',
  status: 'open' as const,
  createdById: 'rep1',
  assigneeId: null,
};

describe('canNotify', () => {
  it('chỉ gửi khi active + đã xác minh + bật loại thông báo', () => {
    expect(canNotify(verified('a') as never, 'notifyTickets')).toBe(true);
    expect(
      canNotify(
        verified('a', { emailVerifiedAt: null }) as never,
        'notifyTickets',
      ),
    ).toBe(false);
    expect(
      canNotify(
        verified('a', { status: 'disabled' }) as never,
        'notifyTickets',
      ),
    ).toBe(false);
    expect(
      canNotify(
        verified('a', { notifyTickets: false }) as never,
        'notifyTickets',
      ),
    ).toBe(false);
    expect(canNotify(null, 'notifyTickets')).toBe(false);
  });
});

describe('NotificationsService - ticket', () => {
  it('báo người được giao khi đổi người xử lý', async () => {
    const { service, mail } = setup({ dev1: verified('dev1') });
    await service.ticketUpdated(
      'admin0',
      { status: 'open', assigneeId: null },
      { ...ticket, assigneeId: 'dev1' },
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({
      to: 'dev1@x.vn',
      subject: expect.stringContaining('được giao'),
    });
    expect(mail.send.mock.calls[0][0].text).toContain(
      'https://app.test/tickets?ticket=t1',
    );
  });

  it('không báo khi admin tự giao cho chính mình', async () => {
    const { service, mail } = setup({ dev1: verified('dev1') });
    await service.ticketUpdated(
      'dev1',
      { status: 'open', assigneeId: null },
      { ...ticket, assigneeId: 'dev1' },
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('báo người tạo khi đổi trạng thái, trừ khi chính họ đổi', async () => {
    const { service, mail } = setup({ rep1: verified('rep1') });
    await service.ticketUpdated(
      'dev1',
      { status: 'open', assigneeId: null },
      { ...ticket, status: 'resolved' },
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].text).toContain('"Mới" sang "Đã xử lý"');

    mail.send.mockClear();
    await service.ticketUpdated(
      'rep1',
      { status: 'resolved', assigneeId: null },
      { ...ticket, status: 'closed' },
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('không gửi cho người chưa xác minh email hoặc đã tắt thông báo ticket', async () => {
    const { service, mail } = setup({
      rep1: verified('rep1', { emailVerifiedAt: null }),
      dev1: verified('dev1', { notifyTickets: false }),
    });
    await service.ticketUpdated(
      'admin0',
      { status: 'open', assigneeId: null },
      { ...ticket, status: 'in_progress', assigneeId: 'dev1' },
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('bình luận: báo người tạo + người xử lý, bỏ qua người bình luận', async () => {
    const { service, mail } = setup({
      rep1: verified('rep1'),
      dev1: verified('dev1'),
    });
    await service.ticketCommented(
      'dev1',
      { ...ticket, assigneeId: 'dev1' },
      'Đã fix <b>xong</b>',
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    const msg = mail.send.mock.calls[0][0];
    expect(msg.to).toBe('rep1@x.vn');
    // Nội dung người dùng nhập phải được escape trong HTML.
    expect(msg.html).toContain('Đã fix &lt;b&gt;xong&lt;/b&gt;');
  });

  it('lỗi DB/gửi mail không ném ra ngoài (fire-and-forget an toàn)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.ticketUpdated(
        'admin0',
        { status: 'open', assigneeId: null },
        { ...ticket, assigneeId: 'dev1' },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('NotificationsService - lịch nhắc đến hạn', () => {
  const reminder = (user: ReturnType<typeof verified>) => ({
    id: 'r1',
    dueAt: new Date('2026-11-15T02:00:00Z'),
    note: 'Gọi lại báo giá',
    lead: { customerName: 'Chị Mai' },
    user,
  });

  it('gửi email và đánh dấu notifiedAt', async () => {
    const { service, prisma, mail } = setup();
    prisma.reminder.findMany.mockResolvedValue([reminder(verified('rep1'))]);
    const res = await service.sendDueReminders(
      new Date('2026-11-15T03:00:00Z'),
    );
    expect(res.sent).toBe(1);
    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', notifiedAt: null },
      data: { notifiedAt: new Date('2026-11-15T03:00:00Z') },
    });
    expect(mail.send.mock.calls[0][0].text).toContain('09:00 ngày 15/11/2026');
  });

  it('không gửi trùng khi instance khác đã đánh dấu trước', async () => {
    const { service, prisma, mail } = setup();
    prisma.reminder.findMany.mockResolvedValue([reminder(verified('rep1'))]);
    prisma.reminder.updateMany.mockResolvedValue({ count: 0 });
    expect((await service.sendDueReminders()).sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('đã tắt nhắc qua email thì vẫn đánh dấu nhưng không gửi', async () => {
    const { service, prisma, mail } = setup();
    prisma.reminder.findMany.mockResolvedValue([
      reminder(verified('rep1', { notifyReminders: false })),
    ]);
    await service.sendDueReminders();
    expect(prisma.reminder.updateMany).toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('NotificationsService - tóm tắt cuối ngày', () => {
  const now = new Date('2026-11-16T10:30:00Z'); // 17:30 giờ VN

  it('nhắc khi hôm nay chưa nhập liệu', async () => {
    const { service, mail } = setup({ rep1: verified('rep1') });
    expect((await service.sendDailyDigest(now)).sent).toBe(1);
    expect(mail.send.mock.calls[0][0].subject).toContain('chưa nhập lead');
  });

  it('có nhập liệu thì gửi tóm tắt với số liệu', async () => {
    const { service, prisma, mail } = setup({ rep1: verified('rep1') });
    prisma.lead.count.mockResolvedValue(3);
    prisma.leadActivity.count.mockResolvedValue(5);
    await service.sendDailyDigest(now);
    expect(mail.send.mock.calls[0][0].subject).toBe(
      'Tóm tắt ngày 16/11/2026: 3 lead mới, 5 lần chăm sóc',
    );
  });

  it('chỉ chạy 1 lần mỗi ngày (khoá notification_runs)', async () => {
    const { service, prisma, mail } = setup({ rep1: verified('rep1') });
    prisma.notificationRun.createMany.mockResolvedValue({ count: 0 });
    expect((await service.sendDailyDigest(now)).sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.notificationRun.createMany).toHaveBeenCalledWith({
      data: [{ key: 'daily-digest:2026-11-16' }],
      skipDuplicates: true,
    });
  });

  it('bỏ qua người chưa xác minh / tắt tóm tắt', async () => {
    const { service, mail } = setup({
      a: verified('a', { emailVerifiedAt: null }),
      b: verified('b', { notifyDailyDigest: false }),
    });
    expect((await service.sendDailyDigest(now)).sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('templates', () => {
  it('escape HTML trong mọi nội dung', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    const msg = layout({
      to: 'a@x.vn',
      subject: 's',
      greetingName: '<script>',
      paragraphs: ['p'],
      action: { label: 'Mở', url: 'https://app.test/x?a=1&b=2' },
      footer: 'f',
    });
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('https://app.test/x?a=1&amp;b=2');
    expect(msg.text).toContain('Mở: https://app.test/x?a=1&b=2');
  });
});
