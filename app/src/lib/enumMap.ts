import type { LeadChannel, LeadStatus, OrderStatus } from "./types";

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
