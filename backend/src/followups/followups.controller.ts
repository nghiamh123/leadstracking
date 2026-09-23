import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { FollowupsService } from './followups.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { CreateReminderDto } from './dto/create-reminder.dto.js';
import { UpdateReminderDto } from './dto/update-reminder.dto.js';

// Cùng nhóm role với trang Lead (seo không xem lead).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager, Role.sales)
@Controller()
export class FollowupsController {
  constructor(private followups: FollowupsService) {}

  @Get('leads/:leadId/care')
  leadCare(@CurrentUser() user: JwtPayload, @Param('leadId') leadId: string) {
    return this.followups.leadCare(user, leadId);
  }

  @Post('leads/:leadId/activities')
  logActivity(@CurrentUser() user: JwtPayload, @Param('leadId') leadId: string, @Body() dto: CreateActivityDto) {
    return this.followups.logActivity(user, leadId, {
      type: dto.type,
      note: dto.note,
      happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
    });
  }

  @Post('leads/:leadId/reminders')
  createReminder(@CurrentUser() user: JwtPayload, @Param('leadId') leadId: string, @Body() dto: CreateReminderDto) {
    return this.followups.createReminder(user, leadId, { dueAt: new Date(dto.dueAt), note: dto.note });
  }

  @Get('reminders')
  listMyReminders(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.followups.listMyReminders(user, { status: status === 'done' ? 'done' : 'open' });
  }

  @Patch('reminders/:id')
  updateReminder(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.followups.updateReminder(user, id, {
      done: dto.done,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      note: dto.note,
    });
  }

  @Delete('reminders/:id')
  deleteReminder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.followups.deleteReminder(user, id);
  }
}
