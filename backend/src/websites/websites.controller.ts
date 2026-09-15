import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { WebsitesService } from './websites.service.js';
import { CreateWebsiteDto } from './dto/create-website.dto.js';
import { UpdateWebsiteDto } from './dto/update-website.dto.js';

type GscUploadFiles = { traffic?: Express.Multer.File[]; keywords?: Express.Multer.File[] };

@UseGuards(JwtAuthGuard)
@Controller('websites')
export class WebsitesController {
  constructor(private websitesService: WebsitesService) {}

  @Get()
  findAll() {
    return this.websitesService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Post()
  create(@Body() dto: CreateWebsiteDto) {
    return this.websitesService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebsiteDto) {
    return this.websitesService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Post(':id/reconnect')
  reconnect(@Param('id') id: string) {
    return this.websitesService.reconnect(id);
  }

  /**
   * Upload thủ công CSV export trực tiếp từ giao diện Search Console (Performance report →
   * Export → CSV) - phương án không cần Google Cloud project khi add-on Sheet/Apps Script
   * không dùng được.
   */
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Post(':id/gsc-upload')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'traffic', maxCount: 1 }, { name: 'keywords', maxCount: 1 }]))
  uploadGscData(
    @Param('id') id: string,
    @UploadedFiles() files: GscUploadFiles,
    @Query('rangeStart') rangeStart?: string,
    @Query('rangeEnd') rangeEnd?: string,
  ) {
    return this.websitesService.uploadGscData(
      id,
      { traffic: files.traffic?.[0]?.buffer, keywords: files.keywords?.[0]?.buffer },
      { start: rangeStart, end: rangeEnd },
    );
  }
}
