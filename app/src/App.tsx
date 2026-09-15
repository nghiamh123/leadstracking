import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Keywords } from "./pages/Keywords";
import { Leads } from "./pages/Leads";
import { Orders } from "./pages/Orders";
import { AdminWebsites } from "./pages/admin/Websites";
import { AdminUsers } from "./pages/admin/Users";
import { AdminSyncLogs } from "./pages/admin/SyncLogs";
import { useSession } from "./lib/session";

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useSession();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Đang tải...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <AppShell />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/keywords" element={<Keywords />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/admin/websites" element={<AdminWebsites />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/sync-logs" element={<AdminSyncLogs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
