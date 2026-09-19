import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatNumber } from "../../lib/format";

export const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  itemLabel,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel: string;
  pageSizeOptions?: number[];
}) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} /{" "}
          {formatNumber(total)} {itemLabel}
        </span>
        <label className="flex items-center gap-1.5">
          <span>Số dòng/trang</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-ink"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-ink-soft hover:bg-surface-alt disabled:opacity-40"
        >
          <CaretLeft size={12} /> Trước
        </button>
        <span className="px-2 tabular-nums">
          Trang {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-ink-soft hover:bg-surface-alt disabled:opacity-40"
        >
          Sau <CaretRight size={12} />
        </button>
      </div>
    </div>
  );
}
