import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { AssistantService } from './assistant.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

// Mọi role đều vào được; role nào chưa có persona (sales) thì service trả 403 khi tạo/gửi tin.
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
  createConversation(@CurrentUser() user: JwtPayload) {
    return this.assistantService.createConversation(user);
  }

  @Get('conversations/:id/messages')
  getMessages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.getMessages(user, id);
  }

  @Post('conversations/:id/messages')
  sendMessage(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.assistantService.sendMessage(user, id, dto.text);
  }

  @Delete('conversations/:id')
  deleteConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assistantService.deleteConversation(user, id);
  }
}
