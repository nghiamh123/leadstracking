import { z } from 'zod';
import { defineTool, type AssistantTool } from '../personas/persona.js';
import { MAX_LIMIT, type SeoInsightsService } from './seo-insights.service.js';
import type { DashboardService } from '../../dashboard/dashboard.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';

const MAX_RANGE_DAYS = 180;

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Ngày không hợp lệ');

const rangeShape = { start: dateStr, end: dateStr };

/** Dùng superRefine trên chính z.object (không .and) để JSON Schema gửi lên API vẫn là `type: object`. */
function checkRange(r: { start: string; end: string }, ctx: z.RefinementCtx) {
  if (r.start > r.end) ctx.addIssue({ code: 'custom', message: 'start phải <= end' });
  if ((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86_400_000 >= MAX_RANGE_DAYS) {
    ctx.addIssue({ code: 'custom', message: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` });
  }
}

const websiteId = z
  .string()
  .optional()
  .describe('ID website lấy từ list_websites. Bỏ trống = tất cả website.');

const limit = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Số dòng tối đa (mặc định 20, tối đa ${MAX_LIMIT}).`);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildSeoTools(
  deps: { insights: SeoInsightsService; dashboard: DashboardService },
  user: JwtPayload,
): AssistantTool[] {
  return [
    defineTool({
      name: 'list_websites',
      description:
        'Danh sách website đang theo dõi: id, tên, domain, trạng thái kết nối, dữ liệu traffic có đến ngày nào, ' +
        'số keyword và khoảng ngày của snapshot keyword, lần đồng bộ gần nhất. Gọi đầu tiên để biết id website và độ mới của dữ liệu.',
      statusLabel: 'Đang xem danh sách website…',
      inputSchema: z.object({}),
      run: () => deps.insights.listWebsites(),
    }),

    defineTool({
      name: 'get_traffic_trend',
      description:
        'Traffic từ Google Search Console (click, impression, CTR, vị trí TB) trong khoảng [start, end], so với kỳ liền trước cùng độ dài, ' +
        'kèm số liệu theo tuần. Nếu kết quả có `comparable: false` thì % thay đổi không đáng tin - phải nói rõ với người dùng.',
      statusLabel: 'Đang xem xu hướng traffic…',
      inputSchema: z.object({ ...rangeShape, websiteId }).superRefine(checkRange),
      run: (input) => deps.insights.trafficTrend(input),
    }),

    defineTool({
      name: 'find_keyword_opportunities',
      description:
        'Tìm cơ hội từ khoá trong snapshot GSC ~28 ngày gần nhất. type: ' +
        '"striking_distance" = vị trí 4-20 và có impression, đẩy lên top 3 sẽ thêm nhiều click; ' +
        '"low_ctr" = đang ở top 10 nhưng CTR thấp hơn một nửa mức kỳ vọng ở vị trí đó (nên sửa title/meta description); ' +
        '"top_performers" = keyword top 5 đang mang click nhiều nhất (cần giữ hạng). ' +
        '`estimatedExtraClicks` là ước tính thô dựa trên CTR trung bình ngành.',
      statusLabel: 'Đang phân tích từ khoá…',
      inputSchema: z.object({
        type: z.enum(['striking_distance', 'low_ctr', 'top_performers']),
        websiteId,
        minImpressions: z
          .number()
          .int()
          .min(1)
          .max(100_000)
          .optional()
          .describe('Ngưỡng impression tối thiểu (mặc định 10).'),
        limit,
      }),
      run: (input) => deps.insights.keywordOpportunities(input),
    }),

    defineTool({
      name: 'search_keywords',
      description:
        'Tìm keyword trong snapshot GSC có chứa một cụm từ (không phân biệt hoa thường), sắp theo impression giảm dần. ' +
        'Dùng khi người dùng hỏi về một sản phẩm/chủ đề cụ thể, vd "ly thủy tinh", "quà tặng tết".',
      statusLabel: 'Đang tìm từ khoá…',
      inputSchema: z.object({
        contains: z.string().trim().min(2).max(100),
        websiteId,
        limit,
      }),
      run: (input) => deps.insights.searchKeywords(input),
    }),

    defineTool({
      name: 'find_cross_site_overlap',
      description:
        'Keyword mà từ 2 website của công ty trở lên cùng xuất hiện trên Google - các site đang tự cạnh tranh nhau (cannibalization). ' +
        'Kết quả rỗng nghĩa là hiện chưa có keyword trùng.',
      statusLabel: 'Đang kiểm tra từ khoá trùng giữa các website…',
      inputSchema: z.object({ limit }),
      run: (input) => deps.insights.crossSiteOverlap(input),
    }),

    defineTool({
      name: 'get_website_funnel',
      description:
        'Phễu chuyển đổi theo từng website trong [start, end]: click (traffic) → lead → đơn hàng và các tỉ lệ chuyển đổi (%). ' +
        'Dùng để tìm website nhiều traffic nhưng ít lead, hoặc so sánh hiệu quả giữa các site.',
      statusLabel: 'Đang xem phễu chuyển đổi…',
      inputSchema: z.object(rangeShape).superRefine(checkRange),
      run: async (input) => {
        const rows = await deps.dashboard.byWebsite(user, input);
        return rows.map((r) => ({
          websiteId: r.websiteId,
          website: r.websiteName,
          clicks: r.clicks,
          leads: r.leadCount,
          orders: r.orderCount,
          clickToLeadPercent: round1(r.leadRate),
          leadToOrderPercent: round1(r.orderRate),
          clickToOrderPercent: round1(r.totalRate),
        }));
      },
    }),
  ];
}
