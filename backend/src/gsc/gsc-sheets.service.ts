import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export interface GscRow {
  date?: string;
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Số xuất ra từ Google Sheets theo locale tiếng Việt của tài khoản: dấu "."
 * là phân cách nghìn, dấu "," là phân cách thập phân (vd "3.015" = 3015,
 * "2,7%" = 2.7%). Phải bóc tách đúng thứ tự: bỏ "%" -> bỏ "." (nghìn) -> đổi
 * "," thành "." (thập phân) -> parseFloat. Nếu sau này đổi locale tài khoản
 * Google sang tiếng Anh, hàm này cần sửa lại theo định dạng mới.
 */
function parseViNumber(raw: string): number {
  const withoutPercent = raw.replace(/%/g, '').trim();
  const withoutThousands = withoutPercent.replace(/\./g, '');
  const normalized = withoutThousands.replace(',', '.');
  const value = parseFloat(normalized);
  return isNaN(value) ? 0 : value;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = parse(text, { skip_empty_lines: true });
  if (rows.length === 0) {
    throw new Error('File CSV rỗng.');
  }
  return rows;
}

async function fetchCsvRows(url: string): Promise<string[][]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Không tải được link CSV (HTTP ${res.status}). Kiểm tra link "Publish to web" còn hiệu lực không.`);
  }
  return parseRows(await res.text());
}

/**
 * Tìm cột theo tên chính xác trước (khớp CSV Sheet "Publish to web" đã test thật), nếu
 * không có thì thử khớp gần đúng (khớp CSV export trực tiếp từ giao diện GSC, có thể ghi
 * hơi khác - vd "Top queries"/"Queries" thay vì "Query").
 */
function findColumn(header: string[], exact: string, contains: string): number {
  const exactIdx = header.indexOf(exact);
  return exactIdx !== -1 ? exactIdx : header.findIndex((h) => h.includes(contains));
}

/** CSV report dimensions=Date (từ Sheet "Publish to web" hoặc export trực tiếp từ GSC): cột Date,Clicks,Impressions,CTR,Position */
function parseTrafficRows(rows: string[][]): GscRow[] {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    date: findColumn(header, 'date', 'date'),
    clicks: findColumn(header, 'clicks', 'click'),
    impressions: findColumn(header, 'impressions', 'impression'),
    ctr: findColumn(header, 'ctr', 'ctr'),
    position: findColumn(header, 'position', 'position'),
  };
  if (idx.date === -1 || idx.clicks === -1 || idx.impressions === -1) {
    throw new Error(
      `Cột trong CSV không đúng như mong đợi (cần Date, Clicks, Impressions, CTR, Position). Header đọc được: ${rows[0].join(', ')}`,
    );
  }
  return rows.slice(1).map((r) => ({
    date: r[idx.date],
    clicks: parseViNumber(r[idx.clicks]),
    impressions: parseViNumber(r[idx.impressions]),
    ctr: idx.ctr === -1 ? 0 : parseViNumber(r[idx.ctr]) / 100,
    position: idx.position === -1 ? 0 : parseViNumber(r[idx.position]),
  }));
}

/** CSV report dimensions=Query (từ Sheet "Publish to web" hoặc export trực tiếp từ GSC): cột Query,Clicks,Impressions,CTR,Position */
function parseKeywordRows(rows: string[][]): GscRow[] {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    query: findColumn(header, 'query', 'quer'), // "quer" khớp cả "queries"/"top queries"
    clicks: findColumn(header, 'clicks', 'click'),
    impressions: findColumn(header, 'impressions', 'impression'),
    ctr: findColumn(header, 'ctr', 'ctr'),
    position: findColumn(header, 'position', 'position'),
  };
  if (idx.query === -1 || idx.clicks === -1 || idx.impressions === -1) {
    throw new Error(
      `Cột trong CSV không đúng như mong đợi (cần Query, Clicks, Impressions, CTR, Position). Header đọc được: ${rows[0].join(', ')}`,
    );
  }
  return rows.slice(1).map((r) => ({
    query: r[idx.query],
    clicks: parseViNumber(r[idx.clicks]),
    impressions: parseViNumber(r[idx.impressions]),
    ctr: idx.ctr === -1 ? 0 : parseViNumber(r[idx.ctr]) / 100,
    position: idx.position === -1 ? 0 : parseViNumber(r[idx.position]),
  }));
}

@Injectable()
export class GscSheetsService {
  async fetchTraffic(url: string): Promise<GscRow[]> {
    return parseTrafficRows(await fetchCsvRows(url));
  }

  async fetchKeywords(url: string): Promise<GscRow[]> {
    return parseKeywordRows(await fetchCsvRows(url));
  }

  /** Parse CSV traffic từ file upload thủ công (vd export trực tiếp từ giao diện GSC). */
  parseTrafficFile(buffer: Buffer): GscRow[] {
    return parseTrafficRows(parseRows(buffer.toString('utf-8')));
  }

  /** Parse CSV từ khoá từ file upload thủ công. */
  parseKeywordsFile(buffer: Buffer): GscRow[] {
    return parseKeywordRows(parseRows(buffer.toString('utf-8')));
  }

  /** Kiểm tra nhanh 1 link CSV có tải và đọc được không (dùng khi thêm/kết nối lại website). */
  async testUrl(url: string): Promise<void> {
    await fetchCsvRows(url);
  }
}
