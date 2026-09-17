import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { SyncStatus } from '../generated/prisma/enums.js';
import { SyncLogsService } from './sync-logs.service.js';
import { SyncNowDto } from './dto/sync-now.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('sync-logs')
export class SyncLogsController {
  constructor(private syncLogsService: SyncLogsService) {}

  @Get()
  findAll(@Query('websiteId') websiteId?: string, @Query('status') status?: SyncStatus) {
    return this.syncLogsService.findAll(websiteId, status);
  }

  @Post(':id/rerun')
  rerun(@Param('id') id: string) {
    return this.syncLogsService.rerun(id);
  }

  /** Đồng bộ ngay theo yêu cầu thủ công - không cần đợi cron 02:00 hay có sẵn 1 log lỗi để "Chạy lại". */
  @Post('sync')
  syncNow(@Body() dto: SyncNowDto) {
    return this.syncLogsService.syncNow(dto.websiteId);
  }
}
