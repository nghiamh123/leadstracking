import { z } from 'zod';
import { defineTool, type AssistantTool } from '../personas/persona.js';
import { checkRange, limit, rangeShape } from '../personas/tool-helpers.js';
import type { LeadInsightsService } from '../leads/lead-insights.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';

export function buildSalesTools(deps: { leads: LeadInsightsService }, user: JwtPayload): AssistantTool[] {
  return [
    defineTool({
      name: 'list_my_open_leads',
      description:
        'Lead đang mở (Mới / Đang chăm sóc) của chính người dùng: khách, website, kênh, sản phẩm quan tâm + số lượng, ' +
        'ngày nhận lead, số ngày đã qua, ghi chú xử lý (phân loại KH, đã làm gì), số đơn đã có. ' +
        'sort: "newest" (mặc định) hoặc "oldest". Có `total` = tổng số lead đang mở, có thể lớn hơn số dòng trả về.',
      statusLabel: 'Đang xem danh sách khách của bạn…',
      inputSchema: z.object({
        status: z.enum(['moi', 'dang_cham_soc']).optional().describe('Chỉ lấy một trạng thái; bỏ trống = cả hai.'),
        sort: z.enum(['newest', 'oldest']).optional(),
        limit,
      }),
      run: (input) => deps.leads.myOpenLeads(user, input),
    }),

    defineTool({
      name: 'search_my_leads',
      description:
        'Tìm lead của người dùng (mọi trạng thái) theo tên khách, tên công ty/nội dung ghi chú, hoặc sản phẩm quan tâm. ' +
        'Vd: "Atlas", "ly thủy tinh", "nhà nước".',
      statusLabel: 'Đang tìm khách…',
      inputSchema: z.object({ query: z.string().trim().min(2).max(100), limit }),
      run: (input) => deps.leads.searchLeads(user, input),
    }),

    defineTool({
      name: 'get_lead_detail',
      description:
        'Chi tiết một lead theo leadId (lấy từ các tool khác): ghi chú đầy đủ, đơn hàng đã có, lịch sử thay đổi trạng thái.',
      statusLabel: 'Đang xem chi tiết khách…',
      inputSchema: z.object({ leadId: z.string().min(1) }),
      run: (input) => deps.leads.leadDetail(user, input.leadId),
    }),

    defineTool({
      name: 'get_my_performance',
      description:
        'Kết quả của chính người dùng trong [start, end]: số lead, đang mở, đã chuyển đơn, huỷ, tỉ lệ chuyển đơn, số đơn, ' +
        'doanh thu (VND) - gom theo kênh.',
      statusLabel: 'Đang xem kết quả bán hàng của bạn…',
      inputSchema: z.object(rangeShape).superRefine(checkRange),
      run: (input) => deps.leads.leadFunnel(user, { ...input, groupBy: 'channel' }),
    }),
  ];
}
