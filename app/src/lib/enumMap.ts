import type {
  LeadChannel,
  LeadStatus,
  OrderStatus,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "./types";

// Backend lưu enum tiếng Anh không dấu (sạch cho DB), frontend hiển thị nhãn
// tiếng Việt. Map 2 chiều ở đây - chỗ duy nhất cần biết cả 2 định dạng.

export const CHANNEL_LABEL: Record<LeadChannel, string> = {
  form_web: "Form web",
  zalo: "Zalo",
  fanpage: "Fanpage",
  hotline: "Hotline",
  chat: "Chat",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  moi: "Mới",
  dang_cham_soc: "Đang chăm sóc",
  da_chuyen_don: "Đã chuyển đơn",
  huy: "Huỷ",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  cho_xu_ly: "Chờ xử lý",
  da_giao: "Đã giao",
  huy: "Huỷ",
};

export const CHANNEL_OPTIONS = Object.keys(CHANNEL_LABEL) as LeadChannel[];
export const LEAD_STATUS_OPTIONS = Object.keys(LEAD_STATUS_LABEL) as LeadStatus[];
export const ORDER_STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Mới",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: "Lỗi chức năng",
  display: "Lỗi hiển thị",
  data: "Sai/thiếu dữ liệu",
  performance: "Chậm/treo",
  request: "Đề xuất tính năng",
  other: "Khác",
};

/** Bộ phận = role của người tạo ticket. */
export const DEPARTMENT_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Quản lý",
  sales: "Sales",
  seo: "SEO/Content",
};

export const TICKET_STATUS_OPTIONS = Object.keys(TICKET_STATUS_LABEL) as TicketStatus[];
export const TICKET_PRIORITY_OPTIONS = Object.keys(TICKET_PRIORITY_LABEL) as TicketPriority[];
export const TICKET_CATEGORY_OPTIONS = Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[];
export const DEPARTMENT_OPTIONS = Object.keys(DEPARTMENT_LABEL) as Role[];
