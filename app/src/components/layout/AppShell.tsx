import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import { Sidebar, SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useSession } from "../../lib/session";
import { isPathAllowed } from "../../lib/nav";

const titleByPath: Record<string, string> = {
  "/dashboard": "Tổng quan",
  "/keywords": "Từ khóa",
  "/leads": "Lead",
  "/orders": "Đơn hàng",
  "/assistant": "Trợ lý AI",
  "/admin/websites": "Quản trị · Website",
  "/admin/users": "Quản trị · Người dùng",
  "/admin/sync-logs": "Quản trị · Nhật ký đồng bộ",
};

export function AppShell() {
  const { currentUser } = useSession();
  const role = currentUser!.role;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const title = titleByPath[pathname] ?? "Tổng quan";

  if (!isPathAllowed(pathname, role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={role} />

      {mobileOpen && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface shadow-none">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-alt"
              aria-label="Đóng menu"
            >
              <X size={18} />
            </button>
            <SidebarContent
              role={role}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
