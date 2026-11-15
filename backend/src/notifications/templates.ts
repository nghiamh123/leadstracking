import type { MailMessage } from './mail.service.js';

/** Mọi nội dung do người dùng nhập (tiêu đề ticket, bình luận, ghi chú...) phải escape trước khi chèn vào HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  to: string;
  subject: string;
  greetingName: string;
  /** Các đoạn văn - chuỗi thuần, sẽ được escape. */
  paragraphs: string[];
  /** Danh sách gạch đầu dòng (tuỳ chọn) - chuỗi thuần. */
  bullets?: string[];
  /** Đoạn trích dẫn (bình luận, ghi chú) - chuỗi thuần. */
  quote?: string;
  action: { label: string; url: string };
  /** Dòng nhỏ cuối thư, VD cách tắt thông báo. */
  footer: string;
}

/** Khung email chung: HTML đơn giản (inline style cho mail client) + bản text thuần tương ứng. */
export function layout(input: LayoutInput): MailMessage {
  const p = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;font-size:14px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<p style="margin:0 0 16px;font-weight:bold;color:#b3540f">Sáng Tạo Việt</p>
${p(`Chào ${input.greetingName},`)}
${input.paragraphs.map(p).join('\n')}
${input.bullets?.length ? `<ul style="margin:0 0 12px;padding-left:20px">${input.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
${input.quote ? `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #d6d3d1;color:#44403c;white-space:pre-wrap">${escapeHtml(input.quote)}</blockquote>` : ''}
<p style="margin:20px 0"><a href="${escapeHtml(input.action.url)}" style="background:#1b2858;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">${escapeHtml(input.action.label)}</a></p>
<p style="margin:0;font-size:12px;color:#78716c">${escapeHtml(input.footer)}</p>
</div></body></html>`;

  const text = [
    `Chào ${input.greetingName},`,
    '',
    ...input.paragraphs,
    ...(input.bullets?.length
      ? ['', ...input.bullets.map((b) => `- ${b}`)]
      : []),
    ...(input.quote
      ? ['', ...input.quote.split('\n').map((l) => `> ${l}`)]
      : []),
    '',
    `${input.action.label}: ${input.action.url}`,
    '',
    input.footer,
  ].join('\n');

  return { to: input.to, subject: input.subject, html, text };
}

export const SETTINGS_FOOTER =
  'Bạn có thể bật/tắt từng loại email thông báo ở trang Tài khoản.';
