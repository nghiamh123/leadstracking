import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { leadOrderScope } from '../common/scope.js';
import { addDays, startOfTodayVn } from '../common/vn-time.js';
import type { LeadActivityType } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

/** Hạn nhắc xa nhất cho phép. */
const MAX_DUE_DAYS = 366;

const leadRef = { select: { id: true, customerName: true, status: true } } as const;

/**
 * Lần liên hệ khách + lịch nhắc chăm sóc. Dùng chung cho API trang Lead và Trợ lý AI.
 * Chỉ thao tác được trên lead trong quyền xem (leadOrderScope); lịch nhắc thuộc về
 * người tạo và chỉ người đó sửa/xoá được.
 */
@Injectable()
export class FollowupsService {
  constructor(private prisma: PrismaService) {}

  private async leadInScope(user: JwtPayload, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [leadOrderScope(user), { id: leadId }, { deletedAt: null }] },
      select: { id: true, customerName: true },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    return lead;
  }

  private checkDueAt(dueAt: Date) {
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('Thời gian nhắc không hợp lệ');
    const today = startOfTodayVn();
    if (dueAt < today) throw new BadRequestException('Không đặt lịch nhắc cho ngày đã qua');
    if (dueAt > addDays(today, MAX_DUE_DAYS)) {
      throw new BadRequestException(`Chỉ đặt lịch nhắc trong vòng ${MAX_DUE_DAYS} ngày tới`);
    }
  }

  /** Hoạt động + lịch nhắc (chưa xong) của một lead - cho cửa sổ "Chăm sóc khách". */
  async leadCare(user: JwtPayload, leadId: string) {
    await this.leadInScope(user, leadId);
    const [activities, reminders] = await Promise.all([
      this.prisma.leadActivity.findMany({
        where: { leadId },
        include: { user: { select: { name: true } } },
        orderBy: { happenedAt: 'desc' },
        take: 50,
      }),
      this.prisma.reminder.findMany({
        where: { leadId, doneAt: null },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { dueAt: 'asc' },
      }),
    ]);
    return { activities, reminders };
  }

  async logActivity(
    user: JwtPayload,
    leadId: string,
    data: { type: LeadActivityType; note?: string; happenedAt?: Date },
  ) {
    await this.leadInScope(user, leadId);
    if (data.happenedAt && data.happenedAt > new Date()) {
      throw new BadRequestException('Thời điểm liên hệ không thể ở tương lai');
    }
    const [activity] = await this.prisma.$transaction([
      this.prisma.leadActivity.create({
        data: { leadId, userId: user.sub, type: data.type, note: data.note?.trim() || null, happenedAt: data.happenedAt },
        include: { user: { select: { name: true } } },
      }),
      // Chạm updatedAt của lead để "lần cập nhật gần nhất" phản ánh việc chăm sóc thật.
      this.prisma.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } }),
    ]);
    return activity;
  }

  async createReminder(
    user: JwtPayload,
    leadId: string,
    data: { dueAt: Date; note: string; source?: 'manual' | 'assistant' },
  ) {
    const lead = await this.leadInScope(user, leadId);
    this.checkDueAt(data.dueAt);
    const reminder = await this.prisma.reminder.create({
      data: { leadId, userId: user.sub, dueAt: data.dueAt, note: data.note.trim(), source: data.source ?? 'manual' },
    });
    return { ...reminder, lead };
  }

  /** Lịch nhắc của chính người dùng. `open` = chưa xong (gồm cả quá hạn), sắp theo hạn. */
  listMyReminders(user: JwtPayload, params: { status: 'open' | 'done'; until?: Date }) {
    return this.prisma.reminder.findMany({
      where: {
        userId: user.sub,
        doneAt: params.status === 'open' ? null : { not: null },
        dueAt: params.until ? { lte: params.until } : undefined,
        // Lead đã xoá (soft delete) thì lịch nhắc của nó không còn ý nghĩa.
        lead: { deletedAt: null },
      },
      include: { lead: leadRef },
      orderBy: params.status === 'open' ? { dueAt: 'asc' } : { doneAt: 'desc' },
      take: 200,
    });
  }

  private async ownReminder(user: JwtPayload, id: string) {
    const reminder = await this.prisma.reminder.findFirst({ where: { id, userId: user.sub } });
    if (!reminder) throw new NotFoundException('Không tìm thấy lịch nhắc');
    return reminder;
  }

  async updateReminder(user: JwtPayload, id: string, data: { done?: boolean; dueAt?: Date; note?: string }) {
    await this.ownReminder(user, id);
    if (data.dueAt) this.checkDueAt(data.dueAt);
    return this.prisma.reminder.update({
      where: { id },
      data: {
        doneAt: data.done === undefined ? undefined : data.done ? new Date() : null,
        dueAt: data.dueAt,
        note: data.note?.trim(),
      },
      include: { lead: leadRef },
    });
  }

  async deleteReminder(user: JwtPayload, id: string) {
    await this.ownReminder(user, id);
    await this.prisma.reminder.delete({ where: { id } });
    return { ok: true };
  }
}
