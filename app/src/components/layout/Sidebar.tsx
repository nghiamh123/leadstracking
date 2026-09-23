import { NavLink } from "react-router-dom";
import {
  ChartLineUp,
  Gauge,
  MagnifyingGlass,
  ShoppingCart,
  UsersThree,
  GearSix,
  Globe,
  ClockCounterClockwise,
  Sparkle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Role } from "../../lib/types";
import { adminNav, mainNav, type NavItem } from "../../lib/nav";

const iconByPath: Record<string, ReactNode> = {
  "/dashboard": <Gauge size={18} />,
  "/keywords": <MagnifyingGlass size={18} />,
  "/leads": <ChartLineUp size={18} />,
  "/orders": <ShoppingCart size={18} />,
  "/assistant": <Sparkle size={18} />,
  "/admin/websites": <Globe size={18} />,
  "/admin/users": <UsersThree size={18} />,
  "/admin/sync-logs": <ClockCounterClockwise size={18} />,
};

function NavGroup({
  items,
  role,
  onNavigate,
}: {
  items: NavItem[];
  role: Role;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items
        .filter((item) => item.roles.includes(role))
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-surface-alt"
              }`
            }
          >
            {iconByPath[item.to]}
            {item.label}
          </NavLink>
        ))}
    </>
  );
}

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const showAdmin = adminNav.some((i) => i.roles.includes(role));
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-serif text-white">
          F
        </div>
        <div>
          <p className="font-serif text-base leading-none text-ink">
            Phễu Chuyển Đổi
          </p>
          <p className="text-[11px] text-muted">Tiến Thành Group</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <NavGroup items={mainNav} role={role} onNavigate={onNavigate} />
      </nav>

      {showAdmin && (
        <div>
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
            Quản trị
          </p>
          <nav className="flex flex-col gap-1">
            <NavGroup items={adminNav} role={role} onNavigate={onNavigate} />
          </nav>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-muted">
        <GearSix size={14} />
        Đồng bộ GSC lúc 02:00 hằng ngày
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarContent role={role} />
      </div>
    </aside>
  );
}
