import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ActiveAdminGuard } from '../common/guards/active-admin.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { HostingsService } from './hostings.service.js';
import { CreateHostingDto } from './dto/create-hosting.dto.js';
import { UpdateHostingDto } from './dto/update-hosting.dto.js';

// Mọi route đều chỉ admin: RolesGuard chặn nhanh theo JWT, ActiveAdminGuard kiểm tra lại
// role/status hiện tại trong database. Không thêm route nào với guard riêng ở cấp method.
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(Role.admin)
@Controller('hostings')
export class HostingsController {
  constructor(private hostingsService: HostingsService) {}

  @Get()
  findAll() {
    return this.hostingsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateHostingDto) {
    return this.hostingsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHostingDto) {
    return this.hostingsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hostingsService.remove(id);
  }

  @Get(':id/password')
  revealPassword(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.hostingsService.revealPassword(id, user);
  }
}
