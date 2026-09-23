import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { AssistantController } from './assistant.controller.js';
import type { AssistantService, ChatEvent } from './assistant.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

const user: JwtPayload = { sub: 'u1', email: 'a@b.vn', role: 'seo', team: null };

function fakeRes() {
  const chunks: string[] = [];
  const res = {
    writableEnded: false,
    status: vi.fn(() => res),
    set: vi.fn(() => res),
    flushHeaders: vi.fn(),
    write: vi.fn((c: string) => chunks.push(c)),
    end: vi.fn(() => (res.writableEnded = true)),
  };
  return { res, chunks };
}

function controllerWith(impl: (onEvent: (e: ChatEvent) => void) => Promise<unknown>) {
  const service = { sendMessage: vi.fn((_u, _id, _t, onEvent) => impl(onEvent)) };
  return new AssistantController(service as unknown as AssistantService);
}

describe('AssistantController.sendMessage (SSE)', () => {
  it('stream các sự kiện rồi gửi done', async () => {
    const controller = controllerWith(async (onEvent) => {
      onEvent({ type: 'start' });
      onEvent({ type: 'tool', name: 'list_websites', label: 'Đang xem…' });
      onEvent({ type: 'text', delta: 'Xin chào' });
      return { text: 'Xin chào', toolsUsed: ['list_websites'] };
    });
    const { res, chunks } = fakeRes();

    await controller.sendMessage(user, 'c1', { text: 'hi' }, res as unknown as Response);

    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8' }));
    expect(chunks).toEqual([
      'event: tool\ndata: {"name":"list_websites","label":"Đang xem…"}\n\n',
      'event: text\ndata: {"delta":"Xin chào"}\n\n',
      'event: done\ndata: {"text":"Xin chào","toolsUsed":["list_websites"]}\n\n',
    ]);
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('lỗi trước khi stream thì ném ra để Nest trả HTTP status bình thường', async () => {
    const controller = controllerWith(async () => {
      throw new ForbiddenException('không có quyền');
    });
    const { res } = fakeRes();

    await expect(
      controller.sendMessage(user, 'c1', { text: 'hi' }, res as unknown as Response),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lỗi giữa chừng thì gửi sự kiện error và đóng stream', async () => {
    const controller = controllerWith(async (onEvent) => {
      onEvent({ type: 'start' });
      throw new ServiceUnavailableException('Không kết nối được tới dịch vụ AI');
    });
    const { res, chunks } = fakeRes();

    await controller.sendMessage(user, 'c1', { text: 'hi' }, res as unknown as Response);

    expect(chunks).toEqual(['event: error\ndata: {"message":"Không kết nối được tới dịch vụ AI"}\n\n']);
    expect(res.end).toHaveBeenCalledOnce();
  });
});
