import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';

const message = {
  to: 'a@x.vn',
  subject: 'Chủ đề',
  html: '<p>hi</p>',
  text: 'hi',
};

function setup(env: Record<string, string | undefined>) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('appUrl ghép FRONTEND_URL (bỏ dấu / thừa), mặc định localhost', () => {
    expect(setup({ FRONTEND_URL: 'https://app.vn/' }).appUrl('/leads')).toBe(
      'https://app.vn/leads',
    );
    expect(setup({}).appUrl('/leads')).toBe('http://localhost:5173/leads');
  });

  it('chưa có RESEND_API_KEY: không gọi API, trả false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(setup({}).send(message)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gửi qua Resend với Bearer key và MAIL_FROM', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const ok = await setup({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'App <noreply@app.vn>',
    }).send(message);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({
      from: 'App <noreply@app.vn>',
      to: ['a@x.vn'],
      subject: 'Chủ đề',
      html: '<p>hi</p>',
      text: 'hi',
    });
  });

  it('thiếu MAIL_FROM thì dùng địa chỉ mặc định của Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await setup({ RESEND_API_KEY: 're_test' }).send(message);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toContain(
      'onboarding@resend.dev',
    );
  });

  it('Resend trả lỗi HTTP hoặc mạng lỗi: trả false, không throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 422,
          text: () => Promise.resolve('bad from'),
        }),
    );
    await expect(
      setup({ RESEND_API_KEY: 're_test' }).send(message),
    ).resolves.toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(
      setup({ RESEND_API_KEY: 're_test' }).send(message),
    ).resolves.toBe(false);
  });
});
