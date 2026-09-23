import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AssistantService } from './assistant.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DashboardService } from '../dashboard/dashboard.service.js';
import type { SeoInsightsService } from './seo/seo-insights.service.js';
import type { LeadInsightsService } from './leads/lead-insights.service.js';
import type { FollowupsService } from '../followups/followups.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const seoUser: JwtPayload = { sub: 'u1', email: 'seo@x.vn', role: 'seo', team: null };

function reply(stop_reason: string, content: unknown[]) {
  return {
    stop_reason,
    stop_details: null,
    content,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
  };
}

/** Client giả: mỗi lần gọi stream() trả lần lượt từng message đã chuẩn bị. */
function fakeClient(replies: ReturnType<typeof reply>[]) {
  const calls: { messageCount: number; toolChoice: unknown }[] = [];
  const stream = vi.fn((params: { messages: unknown[]; tool_choice: unknown }) => {
    calls.push({ messageCount: params.messages.length, toolChoice: params.tool_choice });
    const message = replies.shift()!;
    let onText: (d: string) => void = () => {};
    return {
      on: (_event: string, cb: (d: string) => void) => (onText = cb),
      finalMessage: async () => {
        for (const b of message.content as { type: string; text?: string }[]) {
          if (b.type === 'text') onText(b.text!);
        }
        return message;
      },
    };
  });
  return { client: { beta: { messages: { stream } } }, calls };
}

function setup(opts: { usedToday?: number; role?: JwtPayload['role']; persona?: string } = {}) {
  const rows: { id: string; role: string; content: unknown; createdAt: Date }[] = [];
  const prisma = {
    assistantConversation: {
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', persona: opts.persona ?? 'seo', title: null }),
      update: vi.fn(),
      create: vi.fn(({ data }) => data),
    },
    assistantMessage: {
      count: vi.fn().mockResolvedValue(opts.usedToday ?? 0),
      create: vi.fn(({ data }) => {
        const row = { id: `m${rows.length}`, role: data.role, content: data.content, createdAt: new Date() };
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async () => [...rows]),
      deleteMany: vi.fn(({ where }) => {
        for (const id of where.id.in) rows.splice(rows.findIndex((r) => r.id === id), 1);
      }),
    },
  };
  const config = { get: (k: string) => ({ ANTHROPIC_API_KEY: 'test' })[k] } as unknown as ConfigService;
  const insights = { listWebsites: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Site A' }]) };
  const service = new AssistantService(
    prisma as unknown as PrismaService,
    config,
    insights as unknown as SeoInsightsService,
    {} as DashboardService,
    {} as LeadInsightsService,
    {} as FollowupsService,
  );
  const user = { ...seoUser, role: opts.role ?? 'seo' };
  return { service, rows, prisma, insights, user };
}

describe('AssistantService.sendMessage', () => {
  it('chạy tool rồi trả lời, lưu đủ các lượt theo đúng thứ tự', async () => {
    const { service, rows, insights, prisma, user } = setup();
    const { client, calls } = fakeClient([
      reply('tool_use', [{ type: 'tool_use', id: 't1', name: 'list_websites', input: {} }]),
      reply('end_turn', [{ type: 'text', text: 'Có 1 website.' }]),
    ]);
    Object.assign(service, { client });
    const events: unknown[] = [];

    const res = await service.sendMessage(user, 'c1', 'có bao nhiêu site?', (e) => events.push(e));

    expect(insights.listWebsites).toHaveBeenCalledOnce();
    expect(prisma.assistantConversation.update).toHaveBeenLastCalledWith({
      where: { id: 'c1' },
      data: { title: 'có bao nhiêu site?' },
    });
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(rows[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: JSON.stringify([{ id: 'w1', name: 'Site A' }]) },
    ]);
    expect(calls.map((c) => c.messageCount)).toEqual([1, 3]);
    expect(res).toMatchObject({ text: 'Có 1 website.', toolsUsed: ['list_websites'], truncated: false });
    expect(res.usage).toEqual({ inputTokens: 200, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 20 });
    expect(events).toEqual([
      { type: 'start' },
      { type: 'tool', name: 'list_websites', label: 'Đang xem danh sách website…' },
      { type: 'text', delta: 'Có 1 website.' },
    ]);
  });

  it('tham số tool sai thì trả is_error để model tự sửa, không chạy tool', async () => {
    const { service, rows, user } = setup();
    const { client } = fakeClient([
      reply('tool_use', [
        { type: 'tool_use', id: 't1', name: 'get_traffic_trend', input: { start: '2026-09-10', end: '2026-09-01' } },
      ]),
      reply('end_turn', [{ type: 'text', text: 'ok' }]),
    ]);
    Object.assign(service, { client });

    await service.sendMessage(user, 'c1', 'traffic?');

    const [result] = rows[2].content as { is_error?: boolean; content: string }[];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('start phải <= end');
  });

  it('refusal: không lưu câu trả lời dở, trả lời xin lỗi', async () => {
    const { service, rows, user } = setup();
    const { client } = fakeClient([reply('refusal', [{ type: 'text', text: 'partial' }])]);
    Object.assign(service, { client });

    const res = await service.sendMessage(user, 'c1', '...');

    expect(rows.map((r) => r.role)).toEqual(['user']);
    expect(res.text).toContain('Xin lỗi');
  });

  it('bỏ tool_use bị cắt dở khi hết max_tokens', async () => {
    const { service, rows, user } = setup();
    const { client } = fakeClient([
      reply('max_tokens', [
        { type: 'text', text: 'Đang' },
        { type: 'tool_use', id: 't1', name: 'list_websites', input: {} },
      ]),
    ]);
    Object.assign(service, { client });

    const res = await service.sendMessage(user, 'c1', '...');

    expect(rows[1].content).toEqual([{ type: 'text', text: 'Đang' }]);
    expect(res.truncated).toBe(true);
  });

  it('quá số vòng tool thì buộc model trả lời (tool_choice none)', async () => {
    const { service, user } = setup();
    const toolTurn = () => reply('tool_use', [{ type: 'tool_use', id: 't', name: 'list_websites', input: {} }]);
    const { client, calls } = fakeClient([
      ...Array.from({ length: 8 }, toolTurn),
      reply('end_turn', [{ type: 'text', text: 'xong' }]),
    ]);
    Object.assign(service, { client });

    await service.sendMessage(user, 'c1', '...');

    expect(calls).toHaveLength(9);
    expect(calls[7].toolChoice).toEqual({ type: 'auto' });
    expect(calls[8].toolChoice).toEqual({ type: 'none' });
  });

  it('lỗi giữa chừng thì xoá toàn bộ lượt vừa lưu', async () => {
    const { service, rows, prisma, user } = setup();
    let n = 0;
    const stream = vi.fn(() => ({
      on: () => {},
      finalMessage: async () => {
        if (n++ === 0) return reply('tool_use', [{ type: 'tool_use', id: 't1', name: 'list_websites', input: {} }]);
        throw new Error('network down');
      },
    }));
    Object.assign(service, { client: { beta: { messages: { stream } } } });

    await expect(service.sendMessage(user, 'c1', 'hi')).rejects.toBeInstanceOf(HttpException);
    expect(rows).toEqual([]);
    // Không đặt tên hội thoại theo câu hỏi đã bị xoá.
    expect(prisma.assistantConversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'hi' } }),
    );
  });

  it('không cho gửi tin vào hội thoại của trợ lý ngoài quyền role (vd role bị đổi sau khi tạo)', async () => {
    const { service, user } = setup({ role: 'sales', persona: 'seo' });
    await expect(service.sendMessage(user, 'c1', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hết lượt trong ngày thì trả 429', async () => {
    const { service, user } = setup({ usedToday: 50 });
    await expect(service.sendMessage(user, 'c1', 'hi')).rejects.toSatisfy(
      (e) => e instanceof HttpException && e.getStatus() === 429,
    );
  });
});

describe('AssistantService persona theo role', () => {
  it('status liệt kê trợ lý được dùng, mặc định đứng đầu', async () => {
    const { service } = setup();
    const admin = { ...seoUser, role: 'admin' as const };
    expect((await service.status(admin)).personas.map((p) => p.key)).toEqual(['ops', 'seo']);
    expect((await service.status({ ...seoUser, role: 'sales' })).personas.map((p) => p.key)).toEqual(['sales']);
  });

  it('tạo hội thoại: mặc định theo role, chặn persona ngoài quyền', async () => {
    const { service } = setup();
    const sales = { ...seoUser, role: 'sales' as const };
    await expect(service.createConversation(sales)).resolves.toMatchObject({ persona: 'sales' });
    await expect(service.createConversation(sales, 'seo')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createConversation(seoUser, 'ops')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
