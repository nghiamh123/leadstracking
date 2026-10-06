import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { LoginIngestKeyGuard } from '../common/guards/login-ingest-key.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { LoginEventsService } from './login-events.service.js';
import { IngestLoginEventDto } from './dto/ingest-login-event.dto.js';

@Controller('login-events')
export class LoginEventsController {
  constructor(private service: LoginEventsService) {}

  /** Website tự báo 1 lượt đăng nhập admin về đây (plugin/script trên website gọi). */
  @UseGuards(LoginIngestKeyGuard)
  @Post()
  ingest(@Body() dto: IngestLoginEventDto) {
    return this.service.ingest(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @Get()
  findAll(
    @Query('websiteId') websiteId?: string,
    @Query('username') username?: string,
    @Query('success') success?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      websiteId,
      username,
      success,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @Get('summary')
  summary() {
    return this.service.summary();
  }
}
