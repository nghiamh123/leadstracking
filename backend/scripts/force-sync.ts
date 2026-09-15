import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { SyncScope, SyncStatus, WebsiteStatus } from '../src/generated/prisma/enums.js';

/**
 * Kích hoạt đồng bộ CSV ngay lập tức cho 1 website, không cần đợi cron 2h sáng.
 * Dùng khi vừa cấu hình xong link CSV và muốn thấy dữ liệu ngay thay vì đợi qua đêm.
 *
 * Chạy: npx tsx scripts/force-sync.ts <domain hoặc website id>
 *
 * Đứng ngoài Nest DI (tsx/esbuild không emit decorator metadata Nest cần) nên dùng thẳng
 * PrismaClient, lặp lại logic upsert giống GscSyncService để không phải khởi động cả app.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function parseViNumber(raw: string): number {
  const value = parseFloat(raw.replace(/%/g, '').trim().replace(/\./g, '').replace(',', '.'));
  return isNaN(value) ? 0 : value;
}

function findColumn(header: string[], exact: string, contains: string): number {
  const exactIdx = header.indexOf(exact);
  return exactIdx !== -1 ? exactIdx : header.findIndex((h) => h.includes(contains));
}

async function fetchCsv(url: string): Promise<string[][]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows: string[][] = parse(await res.text(), { skip_empty_lines: true });
  if (rows.length === 0) throw new Error('File CSV rỗng.');
  return rows;
}

async function main() {
  const key = process.argv[2];
  if (!key) throw new Error('Usage: npx tsx scripts/force-sync.ts <domain hoặc website id>');

  const website = await prisma.website.findFirst({ where: { OR: [{ id: key }, { domain: key }] } });
  if (!website) throw new Error(`Không tìm thấy website: ${key}`);
  const websiteId = website.id;

  if (website.trafficCsvUrl) {
    const rows = await fetchCsv(website.trafficCsvUrl);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      date: findColumn(header, 'date', 'date'),
      clicks: findColumn(header, 'clicks', 'click'),
      impressions: findColumn(header, 'impressions', 'impression'),
      ctr: findColumn(header, 'ctr', 'ctr'),
      position: findColumn(header, 'position', 'position'),
    };
    let count = 0;
    for (const r of rows.slice(1)) {
      const date = new Date(r[idx.date]);
      if (isNaN(date.getTime())) continue;
      const data = {
        clicks: parseViNumber(r[idx.clicks]),
        impressions: parseViNumber(r[idx.impressions]),
        ctr: parseViNumber(r[idx.ctr]) / 100,
        position: parseViNumber(r[idx.position]),
      };
      await prisma.gscDailyTraffic.upsert({
        where: { websiteId_date: { websiteId, date } },
        create: { websiteId, date, ...data },
        update: data,
      });
      count++;
    }
    await prisma.syncLog.create({ data: { websiteId, scope: SyncScope.traffic, status: SyncStatus.success, rows: count } });
    console.log(`Traffic: đồng bộ ${count} dòng`);
  }

  if (website.keywordsCsvUrl) {
    const rows = await fetchCsv(website.keywordsCsvUrl);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      query: findColumn(header, 'query', 'quer'),
      clicks: findColumn(header, 'clicks', 'click'),
      impressions: findColumn(header, 'impressions', 'impression'),
      ctr: findColumn(header, 'ctr', 'ctr'),
      position: findColumn(header, 'position', 'position'),
    };
    const rangeEnd = new Date();
    rangeEnd.setUTCHours(0, 0, 0, 0);
    rangeEnd.setDate(rangeEnd.getDate() - 1);
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - 27);
    const syncStartedAt = new Date();
    let count = 0;
    for (const r of rows.slice(1)) {
      const query = r[idx.query];
      if (!query) continue;
      const data = {
        clicks: parseViNumber(r[idx.clicks]),
        impressions: parseViNumber(r[idx.impressions]),
        ctr: parseViNumber(r[idx.ctr]) / 100,
        position: parseViNumber(r[idx.position]),
      };
      await prisma.gscKeyword.upsert({
        where: { websiteId_query: { websiteId, query } },
        create: { websiteId, query, rangeStart, rangeEnd, ...data },
        update: { ...data, syncedAt: new Date() },
      });
      count++;
    }
    await prisma.gscKeyword.deleteMany({ where: { websiteId, syncedAt: { lt: syncStartedAt } } });
    await prisma.syncLog.create({ data: { websiteId, scope: SyncScope.keywords, status: SyncStatus.success, rows: count } });
    console.log(`Keywords: đồng bộ ${count} dòng`);
  }

  await prisma.website.update({ where: { id: websiteId }, data: { status: WebsiteStatus.connected } });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err.message);
    await prisma.$disconnect();
    process.exit(1);
  });
