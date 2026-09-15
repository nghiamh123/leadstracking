import { useEffect, useState } from "react";
import { CaretDown, CaretLeft, CaretRight, CaretUp, MagnifyingGlass } from "@phosphor-icons/react";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { useWebsites } from "../lib/hooks";
import { keywordsApi } from "../lib/api";
import type { Keyword } from "../lib/types";
import { formatNumber, formatPercent } from "../lib/format";

type SortKey = "query" | "impressions" | "clicks" | "ctr" | "position";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const tagLabel: Record<NonNullable<Keyword["tag"]>, { label: string; tone: "yellow" | "green" }> = {
  potential: { label: "Tiềm năng", tone: "yellow" },
  strong: { label: "Mạnh", tone: "green" },
};

export function Keywords() {
  const { websites } = useWebsites();
  const [websiteId, setWebsiteId] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "impressions",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [rows, setRows] = useState<Keyword[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Đổi bộ lọc/sắp xếp/số dòng mỗi trang thì quay lại trang 1.
  useEffect(() => {
    setPage(1);
  }, [websiteId, query, sort, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      keywordsApi
        .list({
          websiteId: websiteId === "all" ? undefined : websiteId,
          search: query || undefined,
          sortBy: sort.key,
          sortDir: sort.dir,
          page,
          pageSize,
        })
        .then((res) => {
          setRows(res.data);
          setTotal(res.total);
          setTotalPages(res.totalPages);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [websiteId, query, sort, page, pageSize]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "query", label: "Từ khóa" },
    { key: "impressions", label: "Impressions" },
    { key: "clicks", label: "Clicks" },
    { key: "ctr", label: "CTR" },
    { key: "position", label: "Vị trí TB" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
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
        <label className="flex flex-1 flex-col gap-1 sm:min-w-[220px]">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Tìm từ khóa
          </span>
          <span className="relative">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="vd: gốm sứ..."
              className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-ink"
            />
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="yellow">Tiềm năng</Badge> impression cao, CTR thấp — cơ hội tối ưu tiêu đề/mô tả
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="green">Mạnh</Badge> vị trí tốt, lượng click cao — cần duy trì
        </span>
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                {columns.map((col) => (
                  <th key={col.key} className="px-6 py-3 font-medium">
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-ink-soft"
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.dir === "asc" ? (
                          <CaretUp size={11} />
                        ) : (
                          <CaretDown size={11} />
                        ))}
                    </button>
                  </th>
                ))}
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium">Phân loại</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                rows.map((r) => {
                  const tag = r.tag ? tagLabel[r.tag] : null;
                  return (
                    <tr
                      key={`${r.websiteId}-${r.query}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-6 py-3 text-ink-soft">{r.query}</td>
                      <td className="px-6 py-3 tabular-nums">
                        {formatNumber(r.impressions)}
                      </td>
                      <td className="px-6 py-3 tabular-nums">{formatNumber(r.clicks)}</td>
                      <td className="px-6 py-3 tabular-nums">{formatPercent(r.ctr)}</td>
                      <td className="px-6 py-3 tabular-nums">{r.position}</td>
                      <td className="px-6 py-3 text-muted">{r.websiteName}</td>
                      <td className="px-6 py-3">
                        {tag ? <Badge tone={tag.tone}>{tag.label}</Badge> : "—"}
                      </td>
                    </tr>
                  );
                })}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted">
                    Không tìm thấy từ khóa phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 text-xs text-muted">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {formatNumber(total)} từ khóa
              </span>
              <label className="flex items-center gap-1.5">
                <span>Số dòng/trang</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-ink"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-ink-soft hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CaretLeft size={12} />
                Trước
              </button>
              <span className="px-2 tabular-nums">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-ink-soft hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
                <CaretRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
