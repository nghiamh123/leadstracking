import { z } from 'zod';
import { defineTool, type AssistantTool } from '../personas/persona.js';
import { checkRange, limit, rangeShape } from '../personas/tool-helpers.js';
import type { LeadInsightsService } from '../leads/lead-insights.service.js';
import type { DashboardService } from '../../dashboard/dashboard.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { websiteFunnelTool } from '../seo/seo.tools.js';

const staleDays = z
  .number()
  .int()
  .min(1)
  .max(365)
  .optional()
  .describe('Số ngày không có tiến triển để coi là bị bỏ quên (mặc định 14).');

export function buildOpsTools(
  deps: { leads: LeadInsightsService; dashboard: DashboardService },
  user: JwtPayload,
): AssistantTool[] {
  return [
    defineTool({
      name: 'get_lead_funnel',
      description:
        'Phễu lead → đơn hàng trong [start, end] (theo ngày nhận lead / ngày đơn), gom theo groupBy: ' +
        '"channel" (kênh), "website", hoặc "sales_rep" (nhân viên sales). Mỗi nhóm có: số lead, đang mở, đã chuyển đơn, huỷ, ' +
        'tỉ lệ chuyển đơn/huỷ (%), số đơn và doanh thu (VND, không tính đơn huỷ). Chỉ gồm dữ liệu trong quyền xem của người hỏi.',
      statusLabel: 'Đang xem phễu lead…',
      inputSchema: z
        .object({ ...rangeShape, groupBy: z.enum(['channel', 'website', 'sales_rep']) })
        .superRefine(checkRange),
      run: (input) => deps.leads.leadFunnel(user, input),
    }),

    defineTool({
      name: 'get_team_workload',
      description:
        'Khối lượng việc HIỆN TẠI của từng nhân viên sales: số lead đang mở, số lead bị bỏ quên, lead mới trong 7 ngày, ' +
        'lead mở lâu nhất (ngày), số lịch nhắc chăm sóc đã quá hạn. Có salesRepId để dùng với find_stale_leads.',
      statusLabel: 'Đang xem khối lượng việc của đội sales…',
      inputSchema: z.object({ staleDays }),
      run: (input) => deps.leads.teamWorkload(user, { staleDays: input.staleDays ?? 14 }),
    }),

    defineTool({
      name: 'find_stale_leads',
      description:
        'Danh sách lead đang mở bị bỏ quên (nhận đã lâu và lâu không cập nhật), cũ nhất trước, kèm ghi chú xử lý gần nhất. ' +
        'Lọc theo salesRepId nếu cần. Thông tin liên hệ của khách đã được ẩn.',
      statusLabel: 'Đang tìm lead bị bỏ quên…',
      inputSchema: z.object({ staleDays, salesRepId: z.string().optional(), limit }),
      run: (input) => deps.leads.staleLeads(user, { ...input, staleDays: input.staleDays ?? 14 }),
    }),

    websiteFunnelTool(deps.dashboard, user),
  ];
}
