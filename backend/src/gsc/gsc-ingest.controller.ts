import { BadRequestException, Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebsiteStatus } from '../generated/prisma/enums.js';
import { GscSyncService } from './gsc-sync.service.js';
import { IngestGscDto } from './dto/ingest-gsc.dto.js';

/**
 * Nhận dữ liệu GSC đẩy từ nguồn ngoài (Google Apps Script gọi thẳng Search Console API
 * bằng OAuth của chủ tài khoản, không qua Sheet CSV) - xem backend/scripts/gsc-apps-script/Code.gs.
 */
@UseGuards(ApiKeyGuard)
@Controller('gsc/ingest')
export class GscIngestController {
  constructor(
    private prisma: PrismaService,
    private gscSync: GscSyncService,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestGscDto) {
    const website = await this.prisma.website.findFirst({ where: { gscProperty: dto.siteUrl } });
    if (!website) {
      throw new NotFoundException(
        `Không tìm thấy website nào có gsc_property = "${dto.siteUrl}". Kiểm tra lại giá trị này trong Quản trị → Website.`,
      );
    }

    const result: { traffic?: { ok: boolean; rows: number }; keywords?: { ok: boolean; rows: number } } = {};

    if (dto.traffic?.length) {
      result.traffic = await this.gscSync.ingestTraffic(website.id, dto.traffic);
    }

    if (dto.keywords?.length) {
      if (!dto.keywordsRangeStart || !dto.keywordsRangeEnd) {
        throw new BadRequestException('Thiếu keywordsRangeStart/keywordsRangeEnd khi gửi keywords.');
      }
      result.keywords = await this.gscSync.ingestKeywords(
        website.id,
        dto.keywords,
        new Date(dto.keywordsRangeStart),
        new Date(dto.keywordsRangeEnd),
      );
    }

    if (website.status !== WebsiteStatus.connected) {
      await this.prisma.website.update({
        where: { id: website.id },
        data: { status: WebsiteStatus.connected },
      });
    }

    return { ok: true, websiteId: website.id, ...result };
  }
}
