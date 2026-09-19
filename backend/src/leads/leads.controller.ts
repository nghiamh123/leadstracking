import {
  BadRequestException,
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
import { ImportSignalUrlDto } from './dto/import-signal-url.dto.js';
import { fetchSignalCsvText, mapSignalRecords } from './signal-import.util.js';

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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.leadsService.findAll(user, {
      websiteId,
      status,
      salesRepId,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
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

  /**
   * Import từ file "TÍN HIỆU ONLINE" (theo dõi tín hiệu dùng chung nhiều
   * website của đội sales) - header tiếng Việt, khớp theo tên cột chứ không
   * theo vị trí, vì cột "Nguồn" quyết định website chứ không phải 1 dropdown.
   */
  @Post('import-signal')
  @Roles(Role.admin, Role.manager)
  @UseInterceptors(FileInterceptor('file'))
  async importSignal(
    @UploadedFile() file: Express.Multer.File,
    @Query('year') year: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000) {
      throw new BadRequestException('Thiếu hoặc sai tham số "year"');
    }

    const records: Record<string, string>[] = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return this.leadsService.importSignalRows(mapSignalRecords(records), yearNum, user);
  }

  /** Giống `import-signal` nhưng lấy CSV từ link "Publish to web" thay vì upload file thủ công. */
  @Post('import-signal-url')
  @Roles(Role.admin, Role.manager)
  async importSignalUrl(@Body() dto: ImportSignalUrlDto, @CurrentUser() user: JwtPayload) {
    const text = await fetchSignalCsvText(dto.url).catch((err: Error) => {
      throw new BadRequestException(err.message);
    });
    const records: Record<string, string>[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return this.leadsService.importSignalRows(mapSignalRecords(records), dto.year, user);
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
