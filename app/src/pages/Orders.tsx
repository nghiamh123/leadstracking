import { useEffect, useRef, useState } from "react";
import {
  DotsThreeVertical,
  DownloadSimple,
  FloppyDisk,
  Plus,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { useWebsites, useUsers } from "../lib/hooks";
import { leadsApi, ordersApi, ApiError } from "../lib/api";
import { ORDER_STATUS_LABEL, ORDER_STATUS_OPTIONS } from "../lib/enumMap";
import type { Lead, Order, OrderStatus } from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";

const statusTone: Record<OrderStatus, "yellow" | "green" | "red"> = {
  cho_xu_ly: "yellow",
  da_giao: "green",
  huy: "red",
};

const today = new Date().toISOString().slice(0, 10);

function emptyForm(websiteId: string, salesRepId: string): Omit<Order, "id"> {
  return {
    date: today,
    leadId: undefined,
    websiteId,
    value: 0,
    product: "",
    salesRepId,
    status: "cho_xu_ly",
  };
}

export function Orders() {
  const { websites } = useWebsites();
  const { users } = useUsers();
  const salesReps = users.filter((u) => u.role === "sales" || u.role === "manager" || u.role === "admin");

  const [orders, setOrders] = useState<Order[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Order, "id">>(emptyForm("", ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRep, setFilterRep] = useState("all");

  useEffect(() => {
    leadsApi.list({}).then(setAllLeads);
  }, []);

  function reload() {
    setLoading(true);
    return ordersApi
      .list({
        websiteId: filterWebsite === "all" ? undefined : filterWebsite,
        status: filterStatus === "all" ? undefined : (filterStatus as OrderStatus),
        salesRepId: filterRep === "all" ? undefined : filterRep,
      })
      .then(setOrders)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWebsite, filterStatus, filterRep]);

  const totalValue = orders
    .filter((o) => o.status !== "huy")
    .reduce((s, o) => s + o.value, 0);

  function validate(f: Omit<Order, "id">) {
    const errs: Record<string, string> = {};
    if (!f.value || f.value <= 0) errs.value = "Giá trị đơn hàng phải là số dương";
    if (!f.product.trim()) errs.product = "Nhập sản phẩm/dịch vụ";
    return errs;
  }

  function startEdit(order: Order) {
    const { id, ...rest } = order;
    setEditingId(id);
    setForm(rest);
    setFormError(null);
    setTab("form");
    setOpenMenu(null);
  }

  async function removeOrder(id: string) {
    setOpenMenu(null);
    await ordersApi.remove(id);
    reload();
  }

  async function saveOrder(continueEntry: boolean) {
    const errs = validate(form);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    try {
      if (editingId) {
        await ordersApi.update(editingId, form);
        setEditingId(null);
        setTab("list");
        reload();
        return;
      }

      await ordersApi.create(form);
      reload();

      if (continueEntry) {
        setForm((f) => emptyForm(f.websiteId, f.salesRepId));
        setErrors({});
      } else {
        setForm(emptyForm(websites[0]?.id ?? "", salesReps[0]?.id ?? ""));
        setTab("list");
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không lưu được, thử lại.");
    }
  }

  async function handleImport(file: File) {
    const result = await ordersApi.import(file);
    setImportErrors(result.errors);
    reload();
  }

  const linkableLeads = allLeads.filter(
    (l) => l.status === "da_chuyen_don" || l.status === "dang_cham_soc",
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => setTab("list")}
            className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
              tab === "list" ? "bg-ink text-white" : "text-ink-soft"
            }`}
          >
            Danh sách
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm(websites[0]?.id ?? "", salesReps[0]?.id ?? ""));
              setFormError(null);
              setTab("form");
            }}
            className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
              tab === "form" ? "bg-ink text-white" : "text-ink-soft"
            }`}
          >
            Nhập mới
          </button>
        </div>

        {tab === "list" && (
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            <a
              href={ordersApi.templateUrl()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt"
            >
              <DownloadSimple size={16} />
              Tải template
            </a>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt"
            >
              <UploadSimple size={16} />
              Nhập Excel/CSV
            </button>
          </div>
        )}
      </div>

      {importErrors.length > 0 && (
        <div className="rounded-xl border border-pale-red bg-pale-red/40 p-4 text-xs text-pale-red-ink">
          <p className="mb-1 font-medium">Một số dòng import lỗi:</p>
          <ul className="list-disc pl-4">
            {importErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === "list" ? (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
            <Select
              label="Website"
              value={filterWebsite}
              onChange={(e) => setFilterWebsite(e.target.value)}
              className="w-full sm:w-44"
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
              {ORDER_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              label="Sales"
              value={filterRep}
              onChange={(e) => setFilterRep(e.target.value)}
              className="w-full sm:w-44"
            >
              <option value="all">Tất cả</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-wider text-muted">
                Tổng giá trị (đã lọc)
              </p>
              <p className="font-serif text-xl text-ink">{formatCurrency(totalValue)}</p>
            </div>
          </div>

          <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-6 py-3 font-medium">Ngày</th>
                    <th className="px-6 py-3 font-medium">Website</th>
                    <th className="px-6 py-3 font-medium">Sản phẩm</th>
                    <th className="px-6 py-3 font-medium">Giá trị</th>
                    <th className="px-6 py-3 font-medium">Sales</th>
                    <th className="px-6 py-3 font-medium">Lead liên kết</th>
                    <th className="px-6 py-3 font-medium">Trạng thái</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    orders.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="px-6 py-3 text-muted">{formatDate(order.date)}</td>
                        <td className="px-6 py-3 text-muted">
                          {websites.find((w) => w.id === order.websiteId)?.name}
                        </td>
                        <td className="px-6 py-3 font-medium text-ink-soft">{order.product}</td>
                        <td className="px-6 py-3 tabular-nums">{formatCurrency(order.value)}</td>
                        <td className="px-6 py-3 text-muted">
                          {salesReps.find((r) => r.id === order.salesRepId)?.name ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-muted">
                          {allLeads.find((l) => l.id === order.leadId)?.customerName ?? "—"}
                        </td>
                        <td className="px-6 py-3">
                          <Badge tone={statusTone[order.status]}>
                            {ORDER_STATUS_LABEL[order.status]}
                          </Badge>
                        </td>
                        <td className="relative px-6 py-3 text-right">
                          <button
                            onClick={() =>
                              setOpenMenu(openMenu === order.id ? null : order.id)
                            }
                            className="rounded-lg p-1.5 text-muted hover:bg-surface-alt"
                          >
                            <DotsThreeVertical size={18} weight="bold" />
                          </button>
                          {openMenu === order.id && (
                            <div className="absolute right-6 top-10 z-10 w-36 rounded-lg border border-border bg-surface py-1 text-left shadow-none">
                              <button
                                onClick={() => startEdit(order)}
                                className="block w-full px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => removeOrder(order.id)}
                                className="block w-full px-3 py-2 text-sm text-pale-red-ink hover:bg-surface-alt"
                              >
                                Xoá
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-muted">
                        Đang tải...
                      </td>
                    </tr>
                  )}
                  {!loading && orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-muted">
                        Chưa có đơn hàng nào phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="fade-up mx-auto w-full max-w-xl rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-6 font-serif text-lg text-ink">
            {editingId ? "Cập nhật đơn hàng" : "Nhập đơn hàng mới"}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ngày chốt đơn
              </span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
            <Select
              label="Website/Kênh nguồn"
              value={form.websiteId}
              onChange={(e) => setForm((f) => ({ ...f, websiteId: e.target.value }))}
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>

            <Select
              label="Liên kết với Lead (nếu có)"
              value={form.leadId ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, leadId: e.target.value || undefined }))
              }
              className="sm:col-span-2"
            >
              <option value="">Không liên kết</option>
              {linkableLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customerName} ({formatDate(l.date)})
                </option>
              ))}
            </Select>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Giá trị đơn hàng (VND)
              </span>
              <input
                type="number"
                min={0}
                step={100000}
                value={form.value || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, value: Number(e.target.value) }))
                }
                placeholder="0"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
              {errors.value ? (
                <span className="text-xs text-pale-red-ink">{errors.value}</span>
              ) : (
                form.value > 0 && (
                  <span className="text-xs text-muted">
                    {formatCurrency(form.value)}
                  </span>
                )
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Sản phẩm/Dịch vụ
              </span>
              <input
                value={form.product}
                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                placeholder="VD: Vali kéo quà tặng công đoàn"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
              {errors.product && (
                <span className="text-xs text-pale-red-ink">{errors.product}</span>
              )}
            </label>

            <Select
              label="Người phụ trách"
              value={form.salesRepId}
              onChange={(e) => setForm((f) => ({ ...f, salesRepId: e.target.value }))}
            >
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Select
              label="Trạng thái đơn"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as OrderStatus }))
              }
            >
              {ORDER_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          {formError && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-pale-red-ink">
              <Warning size={14} />
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!editingId && (
              <button
                onClick={() => saveOrder(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-alt"
              >
                <Plus size={16} />
                Lưu & nhập tiếp
              </button>
            )}
            <button
              onClick={() => saveOrder(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98]"
            >
              <FloppyDisk size={16} />
              {editingId ? "Cập nhật" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
