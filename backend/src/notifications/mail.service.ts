import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

/**
 * Gửi email qua Resend (gọi thẳng HTTP API, không cần SDK).
 * Không có RESEND_API_KEY thì chỉ ghi log nội dung (tiện test local) - app vẫn chạy bình thường.
 * Không bao giờ throw: gửi mail lỗi không được làm hỏng thao tác chính (cập nhật ticket, đăng nhập...).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  /** Link tuyệt đối tới frontend, VD appUrl('/tickets') - dùng trong nội dung email. */
  appUrl(path: string): string {
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, '');
    return `${base}${path}`;
  }

  async send(message: MailMessage): Promise<boolean> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.log(
        `[chưa cấu hình RESEND_API_KEY - không gửi] To: ${message.to} | ${message.subject}\n${message.text}`,
      );
      return false;
    }

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:
            this.config.get<string>('MAIL_FROM') ||
            'Sáng Tạo Việt <onboarding@resend.dev>',
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.error(
          `Resend trả lỗi ${res.status} khi gửi "${message.subject}" tới ${message.to}: ${await res.text()}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Không gửi được email "${message.subject}" tới ${message.to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
