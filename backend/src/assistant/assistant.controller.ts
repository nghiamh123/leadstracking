import { Body, Controller, Delete, Get, HttpException, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { AssistantService } from './assistant.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';

/** Gửi comment SSE định kỳ để Nginx/proxy không cắt kết nối khi model đang suy nghĩ lâu. */
const HEARTBEAT_MS = 15_000;

// Mọi role đều vào được; service kiểm tra role có được dùng persona của hội thoại không (PERSONAS_BY_ROLE).
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private assistantService: AssistantService) {}

  @Get('status')
  status(@CurrentUser() user: JwtPayload) {
    return this.assistantService.status(user);
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.assistantService.listConversations(user);
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: JwtPayload, @Body() dto: CreateConversationDto) {
    return this.assistantService.createConversation(user, dto.persona);
  }

  @Get('conversations/:id/messages')
  getMessages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.getMessages(user, id);
  }

  /**
   * Trả lời dạng Server-Sent Events: `text` (từng đoạn chữ), `tool` (đang chạy tool nào),
   * `done` (kết quả cuối + usage), `error`. Lỗi xảy ra trước khi bắt đầu (403/404/409/429...)
   * vẫn trả HTTP status + JSON bình thường như các API khác.
   *
   * Khi deploy sau Nginx cần `proxy_buffering off` cho location này (header X-Accel-Buffering
   * bên dưới đã tắt buffering cho riêng response này nếu Nginx tôn trọng header đó).
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    let started = false;
    let heartbeat: NodeJS.Timeout | undefined;
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const start = () => {
      if (started) return;
      started = true;
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), HEARTBEAT_MS);
    };

    try {
      const result = await this.assistantService.sendMessage(user, id, dto.text, (e) => {
        start();
        if (e.type === 'text') send('text', { delta: e.delta });
        if (e.type === 'tool') send('tool', { name: e.name, label: e.label });
      });
      start();
      send('done', result);
    } catch (err) {
      // Chưa mở stream → để exception filter của Nest trả status + JSON như bình thường.
      if (!started) throw err;
      send('error', {
        message: err instanceof HttpException ? err.message : 'Trợ lý AI gặp lỗi, thử lại sau.',
      });
    } finally {
      clearInterval(heartbeat);
      if (started) res.end();
    }
  }

  @Delete('conversations/:id')
  deleteConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.deleteConversation(user, id);
  }
}
