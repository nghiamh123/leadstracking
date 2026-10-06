import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { Pagination, DEFAULT_PAGE_SIZE_OPTIONS } from "../../components/ui/Pagination";
import { useWebsites } from "../../lib/hooks";
import { loginEventsApi } from "../../lib/api";
import type { LoginEventEntry, LoginEventsSummary } from "../../lib/api";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20";

export function AdminLoginLogs() {
  const { websites } = useWebsites();
  const [events, setEvents] = useState<LoginEventEntry[]>([]);
  const [summary, setSummary] = useState<LoginEventsSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE_OPTIONS[0]);
  const [loading, setLoading] = useState(true);
  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [username, setUsername] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const websiteName = (id: string) => websites.find((w) => w.id === id)?.name ?? id;

  // Đổi bộ lọc/số dòng mỗi trang thì quay lại trang 1.
  useEffect(() => {
    setPage(1);
  }, [filterWebsite, filterResult, username, from, to, pageSize]);

  useEffect(() => {
    loginEventsApi.summary().then(setSummary);
  }, []);

  useEffect(() => {
    setLoading(true);
    // Debounce nhẹ để gõ username không bắn request mỗi phím.
    const t = setTimeout(() => {
      loginEventsApi
        .list({
          websiteId: filterWebsite === "all" ? undefined : filterWebsite,
          success: filterResult === "all" ? undefined : filterResult,
          username: username || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize,
        })
        .then((res) => {
          setEvents(res.data);
          setTotal(res.total);
          setTotalPages(res.totalPages);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filterWebsite, filterResult, username, from, to, page, pageSize]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <p className="text-sm text-muted">
        Ai đã đăng nhập trang admin của website nào, lúc nào. Dữ liệu do từng website tự báo về; log được giữ 90 ngày.
      </p>

      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Đăng nhập thành công hôm nay" value={summary.successToday} />
          <Stat label="Người dùng khác nhau hôm nay" value={summary.activeUsersToday} />
          <Stat label="Đăng nhập thất bại hôm nay" value={summary.failedToday} warn={summary.failedToday > 0} />
        </div>
      )}

      {summary && summary.suspicious.length > 0 && (
        <div className="rounded-xl border border-border bg-pale-red p-4 text-sm text-pale-red-ink">
          <p className="font-medium">Đáng ngờ: đăng nhập sai nhiều lần trong 1 giờ qua</p>
          <ul className="mt-1 list-disc pl-5">
            {summary.suspicious.map((s) => (
              <li key={s.websiteId + s.username}>
                {s.username} trên {websiteName(s.websiteId)}: {s.failedCount} lần sai
              </li>
            ))}
          </ul>
        </div>
      )}

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
          label="Kết quả"
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="all">Tất cả</option>
          <option value="true">Thành công</option>
          <option value="false">Thất bại</option>
        </Select>
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted sm:w-48">
          Người dùng
          <input
            className={inputClass}
            placeholder="Tên đăng nhập / email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Từ ngày
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Đến ngày
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Thời điểm</th>
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium">Người dùng</th>
                <th className="px-6 py-3 font-medium">Kết quả</th>
                <th className="px-6 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                events.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 tabular-nums text-muted">
                      {new Date(e.occurredAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{websiteName(e.websiteId)}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {e.username}
                      {e.user && <span className="ml-2 text-xs text-muted">({e.user.name})</span>}
                    </td>
                    <td className="px-6 py-3">
                      <Badge tone={e.success ? "green" : "red"}>{e.success ? "Thành công" : "Thất bại"}</Badge>
                    </td>
                    <td className="px-6 py-3 tabular-nums text-muted" title={e.userAgent ?? undefined}>
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">
                    Chưa có lượt đăng nhập phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="lượt đăng nhập"
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-pale-red-ink" : "text-ink"}`}>{value}</p>
    </div>
  );
}
