import type { Role } from "./types";

export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

export const mainNav: NavItem[] = [
  { to: "/dashboard", label: "Tổng quan", roles: ["admin", "manager", "sales", "seo"] },
  { to: "/keywords", label: "Từ khóa", roles: ["admin", "manager", "seo"] },
  { to: "/leads", label: "Lead", roles: ["admin", "manager", "sales"] },
  { to: "/orders", label: "Đơn hàng", roles: ["admin", "manager", "sales"] },
  { to: "/assistant", label: "Trợ lý AI", roles: ["admin", "manager", "sales", "seo"] },
];

export const adminNav: NavItem[] = [
  { to: "/admin/websites", label: "Website", roles: ["admin"] },
  { to: "/admin/users", label: "Người dùng", roles: ["admin"] },
  { to: "/admin/sync-logs", label: "Nhật ký đồng bộ", roles: ["admin"] },
];

const allNav = [...mainNav, ...adminNav];

export function isPathAllowed(pathname: string, role: Role): boolean {
  const item = allNav.find((i) => i.to === pathname);
  return item ? item.roles.includes(role) : true;
}
