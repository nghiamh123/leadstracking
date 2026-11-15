import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from './mail.service.js';
import { layout, SETTINGS_FOOTER } from './templates.js';
import {
  Role,
  UserStatus,
  type TicketStatus,
} from '../generated/prisma/enums.js';
import { addDays, startOfTodayVn, vnDate, vnTime } from '../common/vn-time.js';

const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Mới',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};

const RECIPIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  notifyTickets: true,
  notifyReminders: true,
  notifyDailyDigest: true,
} as const;

type NotifyPref = 'notifyTickets' | 'notifyReminders' | 'notifyDailyDigest';

interface Recipient {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  notifyTickets: boolean;
  notifyReminders: boolean;
  notifyDailyDigest: boolean;
}

/** Chỉ gửi cho tài khoản còn hoạt động, đã xác minh email và đang bật loại thông báo đó. */
export function canNotify(
  user: Recipient | null | undefined,
  pref: NotifyPref,
): user is Recipient {
  return Boolean(
    user &&
    user.status === UserStatus.active &&
    user.emailVerifiedAt &&
    user[pref],
  );
}

interface TicketRef {
  id: string;
  number: number;
  title: string;
  status: TicketStatus;
  createdById: string;
  assigneeId: string | null;
}

/** Số reminder tối đa xử lý mỗi lượt cron - phần còn lại để lượt sau. */
const REMINDER_BATCH = 100;

/**
 * Email thông báo: ticket (giao việc, đổi trạng thái, bình luận), lịch nhắc đến hạn, tóm tắt cuối ngày cho Sales.
 * Các hàm notify* tự bắt lỗi - gọi kiểu fire-and-forget từ service khác, không làm hỏng request chính.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** Gọi sau khi cập nhật ticket: báo người được giao (nếu đổi người xử lý) và người tạo (nếu đổi trạng thái). */
  async ticketUpdated(
    actorId: string,
    before: { status: TicketStatus; assigneeId: string | null },
    after: TicketRef,
  ): Promise<void> {
    await this.safely('ticketUpdated', async () => {
      const ticketUrl = this.mail.appUrl(`/tickets?ticket=${after.id}`);
      const label = `#${after.number} ${after.title}`;

      if (
        after.assigneeId &&
        after.assigneeId !== before.assigneeId &&
        after.assigneeId !== actorId
      ) {
        const assignee = await this.recipient(after.assigneeId);
        if (canNotify(assignee, 'notifyTickets')) {
          await this.mail.send(
            layout({
              to: assignee.email,
              subject: `[Ticket #${after.number}] Bạn được giao xử lý: ${after.title}`,
              greetingName: assignee.name,
              paragraphs: [`Bạn vừa được giao xử lý ticket ${label}.`],
              action: { label: 'Mở ticket', url: ticketUrl },
              footer: SETTINGS_FOOTER,
            }),
          );
        }
      }

      if (after.status !== before.status && after.createdById !== actorId) {
        const creator = await this.recipient(after.createdById);
        if (canNotify(creator, 'notifyTickets')) {
          await this.mail.send(
            layout({
              to: creator.email,
              subject: `[Ticket #${after.number}] ${TICKET_STATUS_LABEL[after.status]}: ${after.title}`,
              greetingName: creator.name,
              paragraphs: [
                `Ticket ${label} của bạn vừa chuyển từ "${TICKET_STATUS_LABEL[before.status]}" sang "${TICKET_STATUS_LABEL[after.status]}".`,
              ],
              action: { label: 'Xem ticket', url: ticketUrl },
              footer: SETTINGS_FOOTER,
            }),
          );
        }
      }
    });
  }

  /** Bình luận mới: báo người tạo và người xử lý (trừ chính người bình luận). */
  async ticketCommented(
    actorId: string,
    ticket: TicketRef,
    body: string,
  ): Promise<void> {
    await this.safely('ticketCommented', async () => {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      const ids = [
        ...new Set(
          [ticket.createdById, ticket.assigneeId].filter(
            (id): id is string => !!id && id !== actorId,
          ),
        ),
      ];
      for (const id of ids) {
        const user = await this.recipient(id);
        if (!canNotify(user, 'notifyTickets')) continue;
        await this.mail.send(
          layout({
            to: user.email,
            subject: `[Ticket #${ticket.number}] Bình luận mới: ${ticket.title}`,
            greetingName: user.name,
            paragraphs: [
              `${actor?.name ?? 'Một người dùng'} vừa bình luận ở ticket #${ticket.number} ${ticket.title}:`,
            ],
            quote: body.trim(),
            action: {
              label: 'Trả lời',
              url: this.mail.appUrl(`/tickets?ticket=${ticket.id}`),
            },
            footer: SETTINGS_FOOTER,
          }),
        );
      }
    });
  }

  /** Mỗi 5 phút: gửi email cho lịch nhắc đã đến hạn, chưa xong, chưa gửi. */
  @Cron('*/5 * * * *')
  async sendDueReminders(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    await this.safely('sendDueReminders', async () => {
      const due = await this.prisma.reminder.findMany({
        where: {
          dueAt: { lte: now },
          doneAt: null,
          notifiedAt: null,
          lead: { deletedAt: null },
        },
        include: {
          lead: { select: { customerName: true } },
          user: { select: RECIPIENT_SELECT },
        },
        orderBy: { dueAt: 'asc' },
        take: REMINDER_BATCH,
      });

      for (const reminder of due) {
        // Đánh dấu trước khi gửi (chỉ khi chưa ai đánh dấu) - nếu cron chạy song song ở instance khác thì không gửi trùng.
        const { count } = await this.prisma.reminder.updateMany({
          where: { id: reminder.id, notifiedAt: null },
          data: { notifiedAt: now },
        });
        if (count === 0 || !canNotify(reminder.user, 'notifyReminders'))
          continue;

        await this.mail.send(
          layout({
            to: reminder.user.email,
            subject: `Nhắc chăm sóc khách: ${reminder.lead.customerName}`,
            greetingName: reminder.user.name,
            paragraphs: [
              `Đã đến hạn chăm sóc khách ${reminder.lead.customerName} (hẹn lúc ${vnTime(reminder.dueAt)} ngày ${formatVnDay(reminder.dueAt)}).`,
            ],
            quote: reminder.note,
            action: {
              label: 'Mở danh sách việc cần làm',
              url: this.mail.appUrl('/leads'),
            },
            footer: SETTINGS_FOOTER,
          }),
        );
        sent++;
      }
    });
    return { sent };
  }

  /** 17:30 thứ 2 - thứ 7 (giờ VN): tóm tắt trong ngày cho Sales, nhắc nếu hôm nay chưa nhập liệu. */
  @Cron('30 17 * * 1-6', { timeZone: 'Asia/Ho_Chi_Minh' })
  async sendDailyDigest(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    await this.safely('sendDailyDigest', async () => {
      if (!(await this.claimRun(`daily-digest:${vnDate(now)}`))) return;

      const today = startOfTodayVn(now);
      const tomorrow = addDays(today, 1);
      const users = await this.prisma.user.findMany({
        where: { role: Role.sales },
        select: RECIPIENT_SELECT,
      });

      for (const user of users) {
        if (!canNotify(user, 'notifyDailyDigest')) continue;
        const [leadsToday, activitiesToday, overdue, dueTomorrow] =
          await Promise.all([
            this.prisma.lead.count({
              where: {
                createdById: user.id,
                createdAt: { gte: today },
                deletedAt: null,
              },
            }),
            this.prisma.leadActivity.count({
              where: { userId: user.id, happenedAt: { gte: today } },
            }),
            this.prisma.reminder.count({
              where: {
                userId: user.id,
                doneAt: null,
                dueAt: { lt: today },
                lead: { deletedAt: null },
              },
            }),
            this.prisma.reminder.count({
              where: {
                userId: user.id,
                doneAt: null,
                dueAt: { gte: tomorrow, lt: addDays(tomorrow, 1) },
                lead: { deletedAt: null },
              },
            }),
          ]);

        const noInput = leadsToday === 0 && activitiesToday === 0;
        await this.mail.send(
          layout({
            to: user.email,
            subject: noInput
              ? `Nhắc nhở: hôm nay (${formatVnDay(now)}) bạn chưa nhập lead nào`
              : `Tóm tắt ngày ${formatVnDay(now)}: ${leadsToday} lead mới, ${activitiesToday} lần chăm sóc`,
            greetingName: user.name,
            paragraphs: noInput
              ? [
                  'Hôm nay bạn chưa nhập lead hay ghi nhận lần chăm sóc khách nào. Nhớ cập nhật trước khi hết ngày nhé.',
                ]
              : ['Đây là tóm tắt công việc hôm nay của bạn:'],
            bullets: [
              `Lead mới nhập: ${leadsToday}`,
              `Lần chăm sóc khách đã ghi: ${activitiesToday}`,
              `Lịch nhắc quá hạn chưa xử lý: ${overdue}`,
              `Lịch nhắc ngày mai: ${dueTomorrow}`,
            ],
            action: {
              label: noInput ? 'Nhập lead' : 'Mở trang Lead',
              url: this.mail.appUrl('/leads'),
            },
            footer: SETTINGS_FOOTER,
          }),
        );
        sent++;
      }
    });
    return { sent };
  }

  private recipient(id: string): Promise<Recipient | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: RECIPIENT_SELECT,
    });
  }

  /** Khoá theo key trong DB: chỉ instance đầu tiên insert được mới chạy job (chống chạy trùng khi nhiều process). */
  private async claimRun(key: string): Promise<boolean> {
    const { count } = await this.prisma.notificationRun.createMany({
      data: [{ key }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private async safely(job: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        `Lỗi khi gửi thông báo (${job}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}

/** "15/11/2026" theo giờ VN. */
function formatVnDay(d: Date): string {
  const [y, m, day] = vnDate(d).split('-');
  return `${day}/${m}/${y}`;
}
