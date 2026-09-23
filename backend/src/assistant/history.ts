import type Anthropic from '@anthropic-ai/sdk';
import type { AssistantMessageRole } from '../generated/prisma/enums.js';

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlock = Anthropic.Beta.BetaContentBlock;

export interface StoredMessage {
  role: AssistantMessageRole;
  content: unknown;
  createdAt: Date;
}

const VN_OFFSET_MS = 7 * 3_600_000;

/** Ngày YYYY-MM-DD theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 hôm nay theo giờ Việt Nam, trả về dạng Date (UTC). */
export function startOfTodayVn(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  vn.setUTCHours(0, 0, 0, 0);
  return new Date(vn.getTime() - VN_OFFSET_MS);
}

/**
 * Chỉ giữ `maxTurns` lượt hỏi gần nhất. Cắt đúng tại tin nhắn của người dùng để
 * không tách rời cặp tool_use / tool_result (API sẽ báo lỗi nếu thiếu một nửa).
 */
export function trimHistory<T extends StoredMessage>(rows: T[], maxTurns: number): T[] {
  const userIdx = rows.flatMap((r, i) => (r.role === 'user' ? [i] : []));
  if (userIdx.length <= maxTurns) return rows;
  return rows.slice(userIdx[userIdx.length - maxTurns]);
}

/**
 * Chuyển lịch sử lưu trong DB sang messages gửi API. Ngày hỏi được gắn vào từng tin nhắn
 * của người dùng (lấy từ createdAt nên luôn ra cùng một chuỗi → không phá prompt cache),
 * thay vì đặt ngày hiện tại trong system prompt.
 */
export function toApiMessages(rows: StoredMessage[]): BetaMessageParam[] {
  return rows.map((r) => {
    if (r.role === 'user') {
      return {
        role: 'user',
        content: `<context>Ngày hiện tại: ${vnDate(r.createdAt)}</context>\n\n${r.content as string}`,
      };
    }
    // tool = tool_result blocks, gửi lên với role "user" theo đúng giao thức API.
    return {
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: r.content as BetaMessageParam['content'],
    };
  });
}

export function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as BetaContentBlock[])
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('');
}

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  toolsUsed: string[];
  createdAt: string;
}

/** Gộp các lượt assistant/tool liên tiếp thành một tin nhắn hiển thị cho giao diện chat. */
export function toDisplayMessages(rows: StoredMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ role: 'user', text: r.content as string, toolsUsed: [], createdAt: r.createdAt.toISOString() });
      continue;
    }
    if (r.role === 'tool') continue;

    let last = out.at(-1);
    if (!last || last.role !== 'assistant') {
      last = { role: 'assistant', text: '', toolsUsed: [], createdAt: r.createdAt.toISOString() };
      out.push(last);
    }
    const blocks = Array.isArray(r.content) ? (r.content as BetaContentBlock[]) : [];
    const text = textOf(blocks);
    if (text) last.text = last.text ? `${last.text}\n\n${text}` : text;
    for (const b of blocks) {
      if (b.type === 'tool_use' && !last.toolsUsed.includes(b.name)) last.toolsUsed.push(b.name);
    }
  }
  return out;
}
