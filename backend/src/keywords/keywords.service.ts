import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type KeywordSortKey = 'query' | 'impressions' | 'clicks' | 'ctr' | 'position';
export type SortDir = 'asc' | 'desc';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

@Injectable()
export class KeywordsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    websiteId?: string;
    search?: string;
    sortBy?: KeywordSortKey;
    sortDir?: SortDir;
    page?: number;
    pageSize?: number;
  }) {
    const rows = await this.prisma.gscKeyword.findMany({
      where: {
        websiteId: params.websiteId,
        query: params.search
          ? { contains: params.search, mode: 'insensitive' }
          : undefined,
      },
      include: { website: { select: { id: true, name: true } } },
    });

    const withCtrPercent = rows.map((r) => ({
      websiteId: r.websiteId,
      websiteName: r.website.name,
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr * 100,
      position: r.position,
      rangeStart: r.rangeStart,
      rangeEnd: r.rangeEnd,
    }));

    // Ngưỡng phân loại tính trên chính tập dữ liệu đang lọc, giống hệt logic
    // đã dùng ở frontend (Keywords.tsx) trước khi chuyển sang backend.
    const impressionsP75 = percentile(withCtrPercent.map((r) => r.impressions), 0.75);
    const ctrMedian = percentile(withCtrPercent.map((r) => r.ctr), 0.5);
    const clicksP75 = percentile(withCtrPercent.map((r) => r.clicks), 0.75);

    const classified = withCtrPercent.map((r) => {
      let tag: 'potential' | 'strong' | null = null;
      if (r.impressions >= impressionsP75 && r.ctr <= ctrMedian) {
        tag = 'potential';
      } else if (r.position <= 10 && r.clicks >= clicksP75) {
        tag = 'strong';
      }
      return { ...r, tag };
    });

    const sortBy = params.sortBy ?? 'impressions';
    const dir = params.sortDir === 'asc' ? 1 : -1;
    classified.sort((a, b) => {
      if (sortBy === 'query') return a.query.localeCompare(b.query) * dir;
      return (a[sortBy] - b[sortBy]) * dir;
    });

    const total = classified.length;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = params.page && params.page > 0 ? Math.min(params.page, totalPages) : 1;
    const start = (page - 1) * pageSize;
    const data = classified.slice(start, start + pageSize);

    return { data, total, page, pageSize, totalPages };
  }
}
