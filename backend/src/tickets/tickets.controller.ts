import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role, type TicketCategory, type TicketPriority, type TicketStatus } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { MAX_IMAGE_BYTES, TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

// Mọi bộ phận đều được gửi ticket; phạm vi xem/sửa do service quyết định (admin = dev xử lý, thấy tất cả).
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('department') department?: Role,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tickets.findAll(user, {
      status,
      priority,
      category,
      department,
      assigneeId,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tickets.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.tickets.update(user, id, dto);
  }

  @Post(':id/comments')
  addComment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.tickets.addComment(user, id, dto.body);
  }

  /** Mỗi request 1 ảnh (trình duyệt đã nén) để luôn dưới giới hạn body mặc định 1MB của nginx. */
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  addImage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.tickets.addImage(user, id, file);
  }

  @Get(':id/images/:imageId')
  async getImage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Res() res: Response,
  ) {
    const image = await this.tickets.getImage(user, id, imageId);
    res
      .set({
        'Content-Type': image.mimeType,
        'Content-Length': String(image.size),
        // Ảnh gắn quyền xem theo ticket nên chỉ cache riêng tư; nosniff chặn trình duyệt đoán sang HTML/JS.
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(Buffer.from(image.data));
  }

  @Delete(':id/images/:imageId')
  removeImage(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('imageId') imageId: string) {
    return this.tickets.removeImage(user, id, imageId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tickets.remove(id);
  }
}
