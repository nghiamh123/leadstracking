import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role, type LeadStatus } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { LeadsService } from './leads.service.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';

const TEMPLATE_HEADER = [
  'Ngày',
  'Website',
  'Họ tên',
  'SĐT',
  'Kênh',
  'Nhu cầu',
  'Sales',
  'Trạng thái',
  'Ghi chú',
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager, Role.sales)
@Controller('leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('websiteId') websiteId?: string,
    @Query('status') status?: LeadStatus,
    @Query('salesRepId') salesRepId?: string,
    @Query('search') search?: string,
  ) {
    return this.leadsService.findAll(user, { websiteId, status, salesRepId, search });
  }

  @Get('template.csv')
  template(@Res() res: Response) {
    res.type('text/csv').send(TEMPLATE_HEADER.join(','));
  }

  @Get(':id/history')
  history(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.findHistory(id, user);
  }

  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.create(dto, user);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    const records: string[][] = parse(file.buffer, { skip_empty_lines: true });
    const rows = records.slice(1).map((r) => ({
      date: r[0],
      websiteName: r[1],
      customerName: r[2],
      contact: r[3],
      channel: r[4],
      interest: r[5],
      salesRepName: r[6],
      status: r[7],
      note: r[8],
    }));
    return this.leadsService.importRows(rows, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.remove(id, user);
  }
}
