import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GscSheetsService } from '../gsc/gsc-sheets.service.js';
import { GscSyncService } from '../gsc/gsc-sync.service.js';
import { WebsiteStatus } from '../generated/prisma/enums.js';
import type { CreateWebsiteDto } from './dto/create-website.dto.js';
import type { UpdateWebsiteDto } from './dto/update-website.dto.js';

// Khi upload thủ công không truyền rõ khoảng ngày report từ khoá, quy ước lấy 28 ngày
// gần nhất tính tới hôm qua - khớp quy ước cũ của đường CSV tự động (KEYWORD_WINDOW_DAYS).
const DEFAULT_KEYWORD_WINDOW_DAYS = 28;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

@Injectable()
export class WebsitesService {
  private readonly logger = new Logger(WebsitesService.name);

  constructor(
    private prisma: PrismaService,
    private gscSheets: GscSheetsService,
    private gscSync: GscSyncService,
  ) {}

  findAll() {
    return this.prisma.website.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateWebsiteDto) {
    const status = await this.probe(dto.trafficCsvUrl, dto.keywordsCsvUrl);
    return this.prisma.website.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        gscProperty: dto.gscProperty,
        trafficCsvUrl: dto.trafficCsvUrl,
        keywordsCsvUrl: dto.keywordsCsvUrl,
        status,
      },
    });
  }

  async update(id: string, dto: UpdateWebsiteDto) {
    const website = await this.assertExists(id);
    // Chuỗi rỗng nghĩa là "xoá link đã cấu hình" (khác với không gửi field
    // này lên - nghĩa là giữ nguyên). Không dùng `??` vì nó không phân biệt
    // được giữa "không gửi" và "gửi rỗng để xoá".
    const trafficCsvUrl =
      dto.trafficCsvUrl !== undefined ? dto.trafficCsvUrl || null : website.trafficCsvUrl;
    const keywordsCsvUrl =
      dto.keywordsCsvUrl !== undefined ? dto.keywordsCsvUrl || null : website.keywordsCsvUrl;
    const status = await this.probe(trafficCsvUrl, keywordsCsvUrl);

    return this.prisma.website.update({
      where: { id },
      data: {
        name: dto.name ?? website.name,
        domain: dto.domain ?? website.domain,
        gscProperty: dto.gscProperty ?? website.gscProperty,
        trafficCsvUrl,
        keywordsCsvUrl,
        status,
      },
    });
  }

  async reconnect(id: string) {
    const website = await this.assertExists(id);
    const status = await this.probe(website.trafficCsvUrl, website.keywordsCsvUrl);
    return this.prisma.website.update({ where: { id }, data: { status } });
  }

  /** Kiểm tra 2 link CSV (traffic & từ khoá) có tải và đọc được không. */
  private async probe(
    trafficCsvUrl: string | null | undefined,
    keywordsCsvUrl: string | null | undefined,
  ): Promise<WebsiteStatus> {
    if (!trafficCsvUrl && !keywordsCsvUrl) return WebsiteStatus.pending;

    try {
      if (trafficCsvUrl) await this.gscSheets.testUrl(trafficCsvUrl);
      if (keywordsCsvUrl) await this.gscSheets.testUrl(keywordsCsvUrl);
      return WebsiteStatus.connected;
    } catch (err) {
      this.logger.warn(`Không tải được link CSV: ${(err as Error).message}`);
      return WebsiteStatus.error;
    }
  }

  /**
   * Nhận CSV export thủ công từ giao diện Search Console thật (Performance report → Export →
   * CSV) - dùng khi không muốn/không thể tự động hoá qua add-on Sheet hay Apps Script.
   */
  async uploadGscData(
    id: string,
    files: { traffic?: Buffer; keywords?: Buffer },
    range?: { start?: string; end?: string },
  ) {
    await this.assertExists(id);
    const result: { traffic?: { ok: boolean; rows: number }; keywords?: { ok: boolean; rows: number } } = {};

    if (files.traffic) {
      const rows = this.gscSheets.parseTrafficFile(files.traffic);
      result.traffic = await this.gscSync.ingestTraffic(id, rows);
    }

    if (files.keywords) {
      const rows = this.gscSheets.parseKeywordsFile(files.keywords);
      const rangeEnd = range?.end ? new Date(range.end) : daysAgo(1);
      const rangeStart = range?.start ? new Date(range.start) : daysAgo(DEFAULT_KEYWORD_WINDOW_DAYS);
      result.keywords = await this.gscSync.ingestKeywords(id, rows, rangeStart, rangeEnd);
    }

    if (result.traffic || result.keywords) {
      await this.prisma.website.update({ where: { id }, data: { status: WebsiteStatus.connected } });
    }

    return result;
  }

  private async assertExists(id: string) {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException('Không tìm thấy website');
    return website;
  }
}
