import type { LeadActivityType } from "../../lib/api";

export const ACTIVITY_LABEL: Record<LeadActivityType, string> = {
  call: "Gọi điện",
  message: "Nhắn tin",
  meeting: "Gặp mặt",
  email: "Email",
  other: "Khác",
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

/** YYYY-MM-DD theo giờ máy người dùng (công ty ở VN nên trùng giờ VN). */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
