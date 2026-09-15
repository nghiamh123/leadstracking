import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { GscSheetsService, type GscRow } from './gsc-sheets.service.js';
import { SyncScope, SyncStatus, WebsiteStatus } from '../generated/prisma/enums.js';

// Nhãn mô tả khoảng ngày cho bảng gsc_keywords - không lấy chính xác từ CSV
// (report Query không có cột ngày), chỉ ghi theo quy ước report Sheet được
// cấu hình "Last 28 days" ở bước setup (xem todo-list.md Phase 3).
const KEYWORD_WINDOW_DAYS = 28;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

@Injectable()
export class GscSyncService {
  private readonly logger = new Logger(GscSyncService.name);

  constructor(
    private prisma: PrismaService,
    private gscSheets: GscSheetsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailySync() {
    const websites = await this.prisma.website.findMany({
      where: { status: WebsiteStatus.connected },
    });
    this.logger.log(`Bắt đầu đồng bộ GSC (qua Sheets CSV) cho ${websites.length} website`);
    for (const website of websites) {
      await this.syncWebsite(website.id);
    }
  }

  /** Đồng bộ 1 website - dùng cho cron hằng ngày lẫn nút "Chạy lại" thủ công. */
  async syncWebsite(websiteId: string) {
    const website = await this.prisma.website.findUniqueOrThrow({ where: { id: websiteId } });

    const trafficResult = await this.syncTraffic(website.id, website.trafficCsvUrl);
    const keywordsResult = await this.syncKeywords(website.id, website.keywordsCsvUrl);

    return { traffic: trafficResult, keywords: keywordsResult };
  }

  private async syncTraffic(websiteId: string, csvUrl: string | null) {
    if (!csvUrl) {
      const message = 'Chưa cấu hình link CSV traffic cho website này (xem Phase 3 todo-list.md).';
      await this.writeLog(websiteId, SyncScope.traffic, SyncStatus.failed, 0, message);
      return { ok: false, error: message };
    }

    try {
      const rows = await this.gscSheets.fetchTraffic(csvUrl);
      return await this.applyTraffic(websiteId, rows);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Đồng bộ traffic thất bại cho website ${websiteId}: ${message}`);
      await this.writeLog(websiteId, SyncScope.traffic, SyncStatus.failed, 0, message);
      return { ok: false, error: message };
    }
  }

  private async syncKeywords(websiteId: string, csvUrl: string | null) {
    if (!csvUrl) {
      const message = 'Chưa cấu hình link CSV từ khoá cho website này (xem Phase 3 todo-list.md).';
      await this.writeLog(websiteId, SyncScope.keywords, SyncStatus.failed, 0, message);
      return { ok: false, error: message };
    }

    const rangeEnd = daysAgo(1);
    const rangeStart = daysAgo(KEYWORD_WINDOW_DAYS);

    try {
      const rows = await this.gscSheets.fetchKeywords(csvUrl);
      return await this.applyKeywords(websiteId, rows, rangeStart, rangeEnd);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Đồng bộ từ khoá thất bại cho website ${websiteId}: ${message}`);
      await this.writeLog(websiteId, SyncScope.keywords, SyncStatus.failed, 0, message);
      return { ok: false, error: message };
    }
  }

  /**
   * Nhận dữ liệu traffic đã lấy sẵn từ nguồn ngoài (vd. Apps Script gọi thẳng Search Console API)
   * và ghi vào DB bằng đúng logic upsert dùng chung với đường đồng bộ CSV.
   */
  async ingestTraffic(websiteId: string, rows: GscRow[]) {
    try {
      return await this.applyTraffic(websiteId, rows);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Ingest traffic thất bại cho website ${websiteId}: ${message}`);
      await this.writeLog(websiteId, SyncScope.traffic, SyncStatus.failed, 0, message);
      throw err;
    }
  }

  /** Tương tự ingestTraffic nhưng cho report từ khoá - cần truyền rõ khoảng ngày report vì không có Sheet quy ước sẵn. */
  async ingestKeywords(websiteId: string, rows: GscRow[], rangeStart: Date, rangeEnd: Date) {
    try {
      return await this.applyKeywords(websiteId, rows, rangeStart, rangeEnd);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Ingest từ khoá thất bại cho website ${websiteId}: ${message}`);
      await this.writeLog(websiteId, SyncScope.keywords, SyncStatus.failed, 0, message);
      throw err;
    }
  }

  private async applyTraffic(websiteId: string, rows: GscRow[]) {
    for (const row of rows) {
      if (!row.date) continue;
      const date = new Date(row.date);
      if (isNaN(date.getTime())) continue;
      await this.prisma.gscDailyTraffic.upsert({
        where: { websiteId_date: { websiteId, date } },
        create: {
          websiteId,
          date,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
        update: {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
      });
    }

    await this.writeLog(websiteId, SyncScope.traffic, SyncStatus.success, rows.length);
    return { ok: true, rows: rows.length };
  }

  private async applyKeywords(websiteId: string, rows: GscRow[], rangeStart: Date, rangeEnd: Date) {
    const syncStartedAt = new Date();

    for (const row of rows) {
      if (!row.query) continue;
      await this.prisma.gscKeyword.upsert({
        where: { websiteId_query: { websiteId, query: row.query } },
        create: {
          websiteId,
          query: row.query,
          rangeStart,
          rangeEnd,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
        update: {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          syncedAt: new Date(),
        },
      });
    }

    // Từ khoá không còn xuất hiện trong report kỳ này -> xoá snapshot cũ.
    await this.prisma.gscKeyword.deleteMany({
      where: { websiteId, syncedAt: { lt: syncStartedAt } },
    });

    await this.writeLog(websiteId, SyncScope.keywords, SyncStatus.success, rows.length);
    return { ok: true, rows: rows.length };
  }

  private writeLog(
    websiteId: string,
    scope: SyncScope,
    status: SyncStatus,
    rows: number,
    message?: string,
  ) {
    return this.prisma.syncLog.create({
      data: { websiteId, scope, status, rows, message },
    });
  }
}
