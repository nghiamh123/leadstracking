import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../notifications/mail.service.js';
import { layout } from '../notifications/templates.js';
import { EmailTokenType, UserStatus } from '../generated/prisma/enums.js';

const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 60 * 60_000;
/** Khoảng cách tối thiểu giữa 2 lần gửi cùng loại email cho cùng người - chống spam hộp thư. */
export const RESEND_COOLDOWN_MS = 60_000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const INVALID_LINK =
  'Link không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email.';

/**
 * Các luồng cần gửi email gắn với tài khoản: xác minh email và quên mật khẩu.
 * Token ngẫu nhiên 32 byte chỉ nằm trong link gửi đi; DB lưu SHA-256, dùng 1 lần, có hạn.
 */
@Injectable()
export class AccountEmailService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** Gửi link xác minh email. Dùng khi người dùng bấm "Gửi lại" hoặc admin vừa tạo tài khoản. */
  async sendVerification(
    userId: string,
  ): Promise<{ ok: true; alreadyVerified?: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    if (await this.sentRecently(user.id, EmailTokenType.verify_email)) {
      throw new HttpException(
        'Vừa gửi email xác minh, vui lòng đợi 1 phút rồi thử lại.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = await this.issueToken(
      user.id,
      EmailTokenType.verify_email,
      VERIFY_TTL_MS,
    );
    await this.mail.send(
      layout({
        to: user.email,
        subject: 'Xác minh email để nhận thông báo từ Sáng Tạo Việt',
        greetingName: user.name,
        paragraphs: [
          'Bấm nút bên dưới để xác minh địa chỉ email này. Sau khi xác minh, bạn sẽ nhận được email thông báo về ticket, lịch nhắc chăm sóc khách và tóm tắt cuối ngày.',
          'Link có hiệu lực trong 24 giờ.',
        ],
        action: {
          label: 'Xác minh email',
          url: this.mail.appUrl(`/verify-email?token=${token}`),
        },
        footer: 'Nếu bạn không dùng hệ thống này, hãy bỏ qua email.',
      }),
    );
    return { ok: true };
  }

  async confirmEmail(token: string): Promise<{ ok: true; email: string }> {
    const record = await this.consumeToken(token, EmailTokenType.verify_email);
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
      select: { email: true },
    });
    return { ok: true, email: user.email };
  }

  /**
   * Luôn trả { ok: true } dù email có tồn tại hay không (không lộ ai có tài khoản);
   * tài khoản bị khoá hoặc vừa gửi trong 1 phút thì im lặng bỏ qua.
   */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim() },
    });
    if (!user || user.status === UserStatus.disabled) return { ok: true };
    if (await this.sentRecently(user.id, EmailTokenType.reset_password))
      return { ok: true };

    const token = await this.issueToken(
      user.id,
      EmailTokenType.reset_password,
      RESET_TTL_MS,
    );
    // Không await việc gửi: thời gian phản hồi giống nhau dù email có tài khoản hay không.
    void this.mail.send(
      layout({
        to: user.email,
        subject: 'Đặt lại mật khẩu Sáng Tạo Việt',
        greetingName: user.name,
        paragraphs: [
          'Có người (có thể là bạn) vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Bấm nút bên dưới để đặt mật khẩu mới.',
          'Link có hiệu lực trong 1 giờ và chỉ dùng được 1 lần.',
        ],
        action: {
          label: 'Đặt lại mật khẩu',
          url: this.mail.appUrl(`/reset-password?token=${token}`),
        },
        footer:
          'Nếu bạn không yêu cầu, hãy bỏ qua email này - mật khẩu hiện tại vẫn giữ nguyên.',
      }),
    );
    return { ok: true };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const record = await this.consumeToken(
      token,
      EmailTokenType.reset_password,
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.userId },
    });
    if (user.status === UserStatus.disabled)
      throw new BadRequestException('Tài khoản đã bị khoá.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        // Mở được link trong hộp thư = email là thật → coi như đã xác minh.
        data: {
          passwordHash,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      }),
      // Huỷ các link đặt lại mật khẩu khác còn hạn của người này.
      this.prisma.emailToken.updateMany({
        where: {
          userId: user.id,
          type: EmailTokenType.reset_password,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  private async issueToken(
    userId: string,
    type: EmailTokenType,
    ttlMs: number,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  /** Kiểm tra token đúng loại, chưa dùng, chưa hết hạn rồi đánh dấu đã dùng (atomic - không dùng được 2 lần). */
  private async consumeToken(token: string, type: EmailTokenType) {
    const record = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !record ||
      record.type !== type ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException(INVALID_LINK);
    }
    const { count } = await this.prisma.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw new BadRequestException(INVALID_LINK);
    return record;
  }

  private async sentRecently(
    userId: string,
    type: EmailTokenType,
  ): Promise<boolean> {
    const recent = await this.prisma.emailToken.findFirst({
      where: {
        userId,
        type,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    return Boolean(recent);
  }
}
