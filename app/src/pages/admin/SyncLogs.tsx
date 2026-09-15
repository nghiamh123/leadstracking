import { useEffect, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { useWebsites } from "../../lib/hooks";
import { syncLogsApi } from "../../lib/api";
import type { SyncLogEntry } from "../../lib/types";

const statusTone: Record<SyncLogEntry["status"], "green" | "red" | "blue"> = {
  success: "green",
  failed: "red",
  running: "blue",
};
const statusLabel: Record<SyncLogEntry["status"], string> = {
  success: "Thành công",
  failed: "Thất bại",
  running: "Đang chạy",
};

export function AdminSyncLogs() {
  const { websites } = useWebsites();
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [rerunningId, setRerunningId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    return syncLogsApi
      .list({
        websiteId: filterWebsite === "all" ? undefined : filterWebsite,
        status: filterStatus === "all" ? undefined : filterStatus,
      })
      .then(setLogs)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWebsite, filterStatus]);

  async function rerun(id: string) {
    setRerunningId(id);
    try {
      await syncLogsApi.rerun(id);
      await reload();
    } finally {
      setRerunningId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <p className="text-sm text-muted">
        Nhật ký đồng bộ dữ liệu Traffic/Từ khóa (đọc từ Google Sheets CSV). Job
        chạy tự động hằng ngày lúc 02:00.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <Select
          label="Website"
          value={filterWebsite}
          onChange={(e) => setFilterWebsite(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">Tất cả</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select
          label="Trạng thái"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="all">Tất cả</option>
          <option value="success">Thành công</option>
          <option value="failed">Thất bại</option>
          <option value="running">Đang chạy</option>
        </Select>
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Thời điểm chạy</th>
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium">Phạm vi</th>
                <th className="px-6 py-3 font-medium">Số dòng</th>
                <th className="px-6 py-3 font-medium">Trạng thái</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {!loading &&
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 tabular-nums text-muted">
                      {new Date(log.runAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">
                      {websites.find((w) => w.id === log.websiteId)?.name}
                    </td>
                    <td className="px-6 py-3 text-muted">
                      {log.scope === "traffic" ? "Traffic tổng" : "Từ khóa"}
                    </td>
                    <td className="px-6 py-3 tabular-nums">{log.rows}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge tone={statusTone[log.status]}>
                          {statusLabel[log.status]}
                        </Badge>
                        {log.message && (
                          <span className="text-xs text-pale-red-ink">{log.message}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {log.status === "failed" && (
                        <button
                          onClick={() => rerun(log.id)}
                          disabled={rerunningId === log.id}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                        >
                          <ArrowsClockwise
                            size={14}
                            className={rerunningId === log.id ? "animate-spin" : ""}
                          />
                          Chạy lại
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">
                    Không có nhật ký phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
