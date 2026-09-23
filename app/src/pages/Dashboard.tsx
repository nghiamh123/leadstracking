import { useEffect, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { KpiCard } from "../components/ui/KpiCard";
import { FunnelChart } from "../components/ui/FunnelChart";
import { TrendChart } from "../components/ui/TrendChart";
import { WebsiteTrendChart } from "../components/ui/WebsiteTrendChart";
import { Select } from "../components/ui/Select";
import { useWebsites, useUsers } from "../lib/hooks";
import { useSession } from "../lib/session";
import { TodayTasks } from "../components/followups/TodayTasks";
import {
  dashboardApi,
  type DashboardSummary,
  type TrendPoint,
  type WebsiteFunnelRow,
  type WebsiteTrendResponse,
} from "../lib/api";
import {
  previousRange,
  rangePresetLabels,
  resolveRange,
  type RangePreset,
} from "../lib/dateRange";
import { formatNumber, formatPercent } from "../lib/format";

function pct(a: number, b: number) {
  return b === 0 ? 0 : (a / b) * 100;
}

function deltaPct(current: number, prev: number) {
  if (prev === 0) return current === 0 ? 0 : 100;
  return ((current - prev) / prev) * 100;
}

const emptySummary: DashboardSummary = { clicks: 0, leadCount: 0, orderCount: 0 };

export function Dashboard() {
  const { currentUser } = useSession();
  const { websites } = useWebsites();
  const { users } = useUsers();
  const salesReps = users.filter((u) => u.role === "sales");

  const [websiteId, setWebsiteId] = useState("all");
  const [repId, setRepId] = useState("all");
  const [preset, setPreset] = useState<RangePreset>("30d");

  const [current, setCurrent] = useState<DashboardSummary>(emptySummary);
  const [previous, setPrevious] = useState<DashboardSummary>(emptySummary);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendByWebsite, setTrendByWebsite] = useState<WebsiteTrendResponse>({
    websites: [],
    data: [],
  });
  const [websiteRows, setWebsiteRows] = useState<WebsiteFunnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end, days } = resolveRange(preset);

  useEffect(() => {
    const prevRange = previousRange(start, days);
    const filters = {
      start,
      end,
      websiteId: websiteId === "all" ? undefined : websiteId,
      salesRepId: repId === "all" ? undefined : repId,
    };

    setLoading(true);
    Promise.all([
      dashboardApi.summary(filters),
      dashboardApi.summary({ ...filters, start: prevRange.start, end: prevRange.end }),
      dashboardApi.trend(filters),
      dashboardApi.trendByWebsite({ start, end }),
      dashboardApi.byWebsite({ start, end, salesRepId: filters.salesRepId }),
    ])
      .then(([curr, prev, trend, trendByWebsiteRes, byWebsite]) => {
        setCurrent(curr);
        setPrevious(prev);
        setTrendData(trend);
        setTrendByWebsite(trendByWebsiteRes);
        setWebsiteRows(byWebsite);
      })
      .finally(() => setLoading(false));
  }, [start, end, days, websiteId, repId]);

  function exportCsv() {
    const url = dashboardApi.exportUrl({
      start,
      end,
      salesRepId: repId === "all" ? undefined : repId,
    });
    window.open(url, "_blank");
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Lịch nhắc chăm sóc khách - chỉ các role làm việc với lead. */}
      {currentUser?.role !== "seo" && <TodayTasks />}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <Select
          label="Website"
          value={websiteId}
          onChange={(e) => setWebsiteId(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">Tất cả website</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select
          label="Khoảng thời gian"
          value={preset}
          onChange={(e) => setPreset(e.target.value as RangePreset)}
          className="w-full sm:w-40"
        >
          {(Object.keys(rangePresetLabels) as RangePreset[])
            .filter((p) => p !== "custom")
            .map((p) => (
              <option key={p} value={p}>
                {rangePresetLabels[p]}
              </option>
            ))}
        </Select>
        <Select
          label="Sales phụ trách"
          value={repId}
          onChange={(e) => setRepId(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">Tất cả Sales</option>
          {salesReps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>

        <button
          onClick={exportCsv}
          className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-alt"
        >
          <DownloadSimple size={16} />
          Xuất Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          index={0}
          label="Tổng Traffic"
          value={formatNumber(current.clicks)}
          delta={deltaPct(current.clicks, previous.clicks)}
        />
        <KpiCard
          index={1}
          label="Tổng Lead"
          value={formatNumber(current.leadCount)}
          delta={deltaPct(current.leadCount, previous.leadCount)}
        />
        <KpiCard
          index={2}
          label="Tổng Đơn hàng"
          value={formatNumber(current.orderCount)}
          delta={deltaPct(current.orderCount, previous.orderCount)}
        />
        <KpiCard
          index={3}
          label="Tỷ lệ chuyển đổi"
          value={formatPercent(pct(current.orderCount, current.clicks), 2)}
          suffix="Traffic → Đơn"
        />
      </div>

      <div className="fade-up rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-6 font-serif text-lg text-ink">Phễu chuyển đổi</h2>
        <FunnelChart
          stages={[
            { label: "Traffic", value: current.clicks, tone: "ink" },
            { label: "Lead", value: current.leadCount, tone: "blue" },
            { label: "Đơn hàng", value: current.orderCount, tone: "green" },
          ]}
        />
      </div>

      <div className="fade-up rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-2 font-serif text-lg text-ink">Xu hướng theo ngày</h2>
        {websiteId === "all" ? (
          <>
            <p className="mb-4 text-xs text-muted">
              Traffic (click) theo từng website — bấm vào tên để ẩn/hiện đường tương ứng.
            </p>
            <WebsiteTrendChart websites={trendByWebsite.websites} data={trendByWebsite.data} />
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              Đang xem: {websites.find((w) => w.id === websiteId)?.name ?? ""} · Trục trái:
              Traffic (click) · Trục phải: số lượng Lead / Đơn hàng
            </p>
            <TrendChart data={trendData} />
          </>
        )}
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg text-ink">So sánh theo website</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium">Traffic</th>
                <th className="px-6 py-3 font-medium">Lead</th>
                <th className="px-6 py-3 font-medium">Đơn hàng</th>
                <th className="px-6 py-3 font-medium">Traffic→Lead</th>
                <th className="px-6 py-3 font-medium">Lead→Đơn</th>
                <th className="px-6 py-3 font-medium">Traffic→Đơn</th>
              </tr>
            </thead>
            <tbody>
              {!loading && websiteRows.map((r) => (
                <tr key={r.websiteId} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-medium text-ink-soft">
                    {r.websiteName}
                  </td>
                  <td className="px-6 py-3 tabular-nums">{formatNumber(r.clicks)}</td>
                  <td className="px-6 py-3 tabular-nums">{formatNumber(r.leadCount)}</td>
                  <td className="px-6 py-3 tabular-nums">{formatNumber(r.orderCount)}</td>
                  <td className="px-6 py-3 tabular-nums">{formatPercent(r.leadRate)}</td>
                  <td className="px-6 py-3 tabular-nums">{formatPercent(r.orderRate)}</td>
                  <td className="px-6 py-3 tabular-nums">{formatPercent(r.totalRate, 2)}</td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted">
                    Đang tải...
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
