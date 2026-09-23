import { describe, expect, it } from 'vitest';
import { startOfTodayVn, toApiMessages, toDisplayMessages, trimHistory, vnDate, type StoredMessage } from './history.js';

const at = (iso: string) => new Date(iso);

describe('vnDate / startOfTodayVn', () => {
  it('tính theo giờ Việt Nam (UTC+7)', () => {
    // 20:00 UTC ngày 22 = 03:00 sáng ngày 23 ở VN
    expect(vnDate(at('2026-09-22T20:00:00Z'))).toBe('2026-09-23');
    expect(startOfTodayVn(at('2026-09-22T20:00:00Z')).toISOString()).toBe('2026-09-22T17:00:00.000Z');
  });
});

describe('trimHistory', () => {
  const rows: StoredMessage[] = [
    { role: 'user', content: 'q1', createdAt: at('2026-09-01') },
    { role: 'assistant', content: [], createdAt: at('2026-09-01') },
    { role: 'tool', content: [], createdAt: at('2026-09-01') },
    { role: 'assistant', content: [], createdAt: at('2026-09-01') },
    { role: 'user', content: 'q2', createdAt: at('2026-09-02') },
    { role: 'assistant', content: [], createdAt: at('2026-09-02') },
  ];

  it('giữ nguyên khi chưa vượt số lượt', () => {
    expect(trimHistory(rows, 2)).toBe(rows);
  });

  it('cắt tại tin nhắn người dùng, không tách cặp tool_use/tool_result', () => {
    const trimmed = trimHistory(rows, 1);
    expect(trimmed.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(trimmed[0].content).toBe('q2');
  });
});

describe('toApiMessages', () => {
  it('gắn ngày hỏi vào tin người dùng và gửi tool result với role user', () => {
    const res = toApiMessages([
      { role: 'user', content: 'traffic tuần này?', createdAt: at('2026-09-23T02:00:00Z') },
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }], createdAt: at('2026-09-23T02:00:01Z') },
      { role: 'tool', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }], createdAt: at('2026-09-23T02:00:02Z') },
    ]);
    expect(res[0]).toEqual({
      role: 'user',
      content: '<context>Ngày hiện tại: 2026-09-23</context>\n\ntraffic tuần này?',
    });
    expect(res[1].role).toBe('assistant');
    expect(res[2].role).toBe('user');
  });
});

describe('toDisplayMessages', () => {
  it('gộp các lượt assistant liên tiếp, bỏ tool result, liệt kê tool đã dùng', () => {
    const res = toDisplayMessages([
      { role: 'user', content: 'hỏi', createdAt: at('2026-09-23T02:00:00Z') },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'x' },
          { type: 'text', text: 'Để mình xem.' },
          { type: 'tool_use', id: 't1', name: 'list_websites', input: {} },
        ],
        createdAt: at('2026-09-23T02:00:01Z'),
      },
      { role: 'tool', content: [{ type: 'tool_result', tool_use_id: 't1', content: '[]' }], createdAt: at('2026-09-23T02:00:02Z') },
      { role: 'assistant', content: [{ type: 'text', text: 'Kết quả...' }], createdAt: at('2026-09-23T02:00:03Z') },
    ]);
    expect(res).toHaveLength(2);
    expect(res[1]).toMatchObject({
      role: 'assistant',
      text: 'Để mình xem.\n\nKết quả...',
      toolsUsed: ['list_websites'],
    });
  });
});
