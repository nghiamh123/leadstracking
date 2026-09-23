import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import { defineTool, type AssistantTool } from '../personas/persona.js';
import { checkRange, dateStr, limit, rangeShape } from '../personas/tool-helpers.js';
import type { LeadInsightsService } from '../leads/lead-insights.service.js';
import type { FollowupsService } from '../../followups/followups.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { fromVnDateTime, startOfTodayVn, vnDate, vnTime } from '../../common/vn-time.js';
import { ACTIVITY_LABELS, excerpt, maskContactInfo } from '../leads/lead-helpers.js';

/** Lỗi nghiệp vụ (lead ngoài quyền, ngày đã qua...) trả về cho model như dữ liệu để nó tự sửa/giải thích. */
async function asToolResult<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpException) return { error: err.message };
    throw err;
  }
}

export function buildSalesTools(
  deps: { leads: LeadInsightsService; followups: FollowupsService },
  user: JwtPayload,
): AssistantTool[] {
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

    defineTool({
      name: 'list_my_reminders',
      description:
        'Lịch nhắc chăm sóc khách CHƯA xong của người dùng, sắp theo hạn (gồm cả lịch đã quá hạn - `overdue: true`).',
      statusLabel: 'Đang xem lịch nhắc của bạn…',
      inputSchema: z.object({}),
      run: async () => {
        const today = startOfTodayVn();
        const rows = await deps.followups.listMyReminders(user, { status: 'open' });
        return {
          today: vnDate(today),
          reminders: rows.map((r) => ({
            reminderId: r.id,
            leadId: r.lead.id,
            customer: r.lead.customerName,
            due: `${vnDate(r.dueAt)} ${vnTime(r.dueAt)}`,
            overdue: r.dueAt < today,
            note: excerpt(maskContactInfo(r.note), 200),
          })),
        };
      },
    }),

    defineTool({
      name: 'create_reminder',
      description:
        'TẠO lịch nhắc chăm sóc một khách cho chính người dùng (hiện trong mục "Việc cần làm" của app). ' +
        'CHỈ gọi khi người dùng yêu cầu rõ ràng (vd "nhắc anh gọi chị Mai thứ 6", "đặt lịch gửi mẫu cho khách X ngày 30/9"). ' +
        'Ngày theo giờ Việt Nam, không được ở quá khứ.',
      statusLabel: 'Đang tạo lịch nhắc…',
      inputSchema: z.object({
        leadId: z.string().min(1).describe('leadId của khách, lấy từ các tool tìm/xem lead.'),
        date: dateStr.describe('Ngày nhắc YYYY-MM-DD.'),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Định dạng HH:mm')
          .optional()
          .describe('Giờ nhắc HH:mm (mặc định 09:00).'),
        note: z.string().trim().min(1).max(500).describe('Việc cần làm, vd "Gọi lại hỏi kết quả trình sếp".'),
      }),
      run: (input) =>
        asToolResult(async () => {
          const r = await deps.followups.createReminder(user, input.leadId, {
            dueAt: fromVnDateTime(input.date, input.time),
            note: input.note,
            source: 'assistant',
          });
          return {
            ok: true,
            reminder: { reminderId: r.id, customer: r.lead.customerName, due: `${vnDate(r.dueAt)} ${vnTime(r.dueAt)}`, note: r.note },
          };
        }),
    }),

    defineTool({
      name: 'log_contact',
      description:
        'GHI LẠI một lần người dùng vừa liên hệ khách (gọi, nhắn, gặp, email) vào lịch sử chăm sóc, thời điểm = bây giờ. ' +
        'CHỈ gọi khi người dùng kể rằng họ đã liên hệ khách và muốn ghi lại (vd "anh vừa gọi chị Mai, chị hẹn tuần sau"). ' +
        'Nội dung trao đổi tóm tắt vào note.',
      statusLabel: 'Đang ghi lại lần liên hệ…',
      inputSchema: z.object({
        leadId: z.string().min(1),
        type: z.enum(['call', 'message', 'meeting', 'email', 'other']),
        note: z.string().trim().max(1000).optional().describe('Tóm tắt nội dung trao đổi / kết quả.'),
      }),
      run: (input) =>
        asToolResult(async () => {
          const a = await deps.followups.logActivity(user, input.leadId, { type: input.type, note: input.note });
          return { ok: true, activity: { type: ACTIVITY_LABELS[a.type], at: `${vnDate(a.happenedAt)} ${vnTime(a.happenedAt)}`, note: a.note } };
        }),
    }),
  ];
}
