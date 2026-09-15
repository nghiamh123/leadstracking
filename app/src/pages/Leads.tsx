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
import { Modal } from "../components/ui/Modal";
import { useWebsites, useUsers } from "../lib/hooks";
import { leadsApi, ApiError } from "../lib/api";
import { CHANNEL_LABEL, CHANNEL_OPTIONS, LEAD_STATUS_LABEL, LEAD_STATUS_OPTIONS } from "../lib/enumMap";
import type { AuditLogEntry, Lead, LeadChannel, LeadStatus } from "../lib/types";
import { formatDate } from "../lib/format";

const statusTone: Record<LeadStatus, "blue" | "yellow" | "green" | "red"> = {
  moi: "blue",
  dang_cham_soc: "yellow",
  da_chuyen_don: "green",
  huy: "red",
};

const FIELD_LABEL: Record<string, string> = {
  date: "Ngày",
  websiteId: "Website",
  customerName: "Họ tên",
  contact: "SĐT",
  channel: "Kênh",
  interest: "Nhu cầu",
  salesRepId: "Người phụ trách",
  status: "Trạng thái",
  note: "Ghi chú",
};

const today = new Date().toISOString().slice(0, 10);

function emptyForm(websiteId: string, salesRepId: string): Omit<Lead, "id"> {
  return {
    date: today,
    websiteId,
    customerName: "",
    contact: "",
    channel: "form_web",
    interest: "",
    salesRepId,
    status: "moi",
    note: "",
  };
}

export function Leads() {
  const { websites } = useWebsites();
  const { users } = useUsers();
  const salesReps = users.filter((u) => u.role === "sales" || u.role === "manager" || u.role === "admin");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Lead, "id">>(emptyForm("", ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Lead | null>(null);
  const [historyEntries, setHistoryEntries] = useState<AuditLogEntry[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRep, setFilterRep] = useState("all");
  const [search, setSearch] = useState("");

  function reload() {
    setLoading(true);
    return leadsApi
      .list({
        websiteId: filterWebsite === "all" ? undefined : filterWebsite,
        status: filterStatus === "all" ? undefined : (filterStatus as LeadStatus),
        salesRepId: filterRep === "all" ? undefined : filterRep,
        search: search || undefined,
      })
      .then(setLeads)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(reload, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWebsite, filterStatus, filterRep, search]);

  function validate(f: Omit<Lead, "id">) {
    const errs: Record<string, string> = {};
    if (!f.customerName.trim()) errs.customerName = "Nhập họ tên khách hàng";
    if (!/^0\d{9,10}$/.test(f.contact.trim()))
      errs.contact = "SĐT phải bắt đầu bằng 0, đủ 10-11 số";
    return errs;
  }

  function startEdit(lead: Lead) {
    const { id, ...rest } = lead;
    setEditingId(id);
    setForm(rest);
    setFormError(null);
    setTab("form");
    setOpenMenu(null);
  }

  async function removeLead(id: string) {
    setOpenMenu(null);
    await leadsApi.remove(id);
    reload();
  }

  async function openHistory(lead: Lead) {
    setHistoryFor(lead);
    setOpenMenu(null);
    const entries = await leadsApi.history(lead.id);
    setHistoryEntries(entries);
  }

  async function saveLead(continueEntry: boolean) {
    const errs = validate(form);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    try {
      if (editingId) {
        await leadsApi.update(editingId, form);
        setEditingId(null);
        setTab("list");
        reload();
        return;
      }

      await leadsApi.create(form);
      reload();

      if (continueEntry) {
        setForm((f) => ({
          ...emptyForm(f.websiteId, f.salesRepId),
          channel: f.channel,
        }));
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
    const result = await leadsApi.import(file);
    setImportErrors(result.errors);
    reload();
  }

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
              href={leadsApi.templateUrl()}
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
              {LEAD_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
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
            <label className="flex flex-1 flex-col gap-1 sm:min-w-[200px]">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Tìm kiếm
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tên hoặc SĐT..."
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
          </div>

          <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-6 py-3 font-medium">Ngày</th>
                    <th className="px-6 py-3 font-medium">Khách hàng</th>
                    <th className="px-6 py-3 font-medium">Liên hệ</th>
                    <th className="px-6 py-3 font-medium">Website</th>
                    <th className="px-6 py-3 font-medium">Kênh</th>
                    <th className="px-6 py-3 font-medium">Nhu cầu</th>
                    <th className="px-6 py-3 font-medium">Sales</th>
                    <th className="px-6 py-3 font-medium">Trạng thái</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-border last:border-0">
                        <td className="px-6 py-3 text-muted">{formatDate(lead.date)}</td>
                        <td className="px-6 py-3 font-medium text-ink-soft">
                          {lead.customerName}
                        </td>
                        <td className="px-6 py-3 tabular-nums text-muted">{lead.contact}</td>
                        <td className="px-6 py-3 text-muted">
                          {websites.find((w) => w.id === lead.websiteId)?.name}
                        </td>
                        <td className="px-6 py-3 text-muted">{CHANNEL_LABEL[lead.channel]}</td>
                        <td className="px-6 py-3 text-muted">{lead.interest}</td>
                        <td className="px-6 py-3 text-muted">
                          {salesReps.find((r) => r.id === lead.salesRepId)?.name ?? "—"}
                        </td>
                        <td className="px-6 py-3">
                          <Badge tone={statusTone[lead.status]}>
                            {LEAD_STATUS_LABEL[lead.status]}
                          </Badge>
                        </td>
                        <td className="relative px-6 py-3 text-right">
                          <button
                            onClick={() =>
                              setOpenMenu(openMenu === lead.id ? null : lead.id)
                            }
                            className="rounded-lg p-1.5 text-muted hover:bg-surface-alt"
                          >
                            <DotsThreeVertical size={18} weight="bold" />
                          </button>
                          {openMenu === lead.id && (
                            <div className="absolute right-6 top-10 z-10 w-40 rounded-lg border border-border bg-surface py-1 text-left shadow-none">
                              <button
                                onClick={() => startEdit(lead)}
                                className="block w-full px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => openHistory(lead)}
                                className="block w-full px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt"
                              >
                                Xem lịch sử
                              </button>
                              <button
                                onClick={() => removeLead(lead.id)}
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
                      <td colSpan={9} className="px-6 py-10 text-center text-muted">
                        Đang tải...
                      </td>
                    </tr>
                  )}
                  {!loading && leads.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-muted">
                        Chưa có lead nào phù hợp bộ lọc.
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
          <h2 className="mb-1 font-serif text-lg text-ink">
            {editingId ? "Cập nhật Lead" : "Nhập Lead mới"}
          </h2>
          <p className="mb-6 text-xs text-muted">
            Lead là tín hiệu quan tâm (khách gọi/nhắn hỏi) — khác với Đơn hàng
            (khách đã chốt mua).
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ngày phát sinh
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

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Họ tên khách hàng
              </span>
              <input
                value={form.customerName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customerName: e.target.value }))
                }
                placeholder="VD: Anh Tuấn"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
              {errors.customerName && (
                <span className="text-xs text-pale-red-ink">{errors.customerName}</span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                SĐT / Kênh liên hệ
              </span>
              <input
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                placeholder="09xxxxxxxx"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
              {errors.contact && (
                <span className="text-xs text-pale-red-ink">{errors.contact}</span>
              )}
            </label>
            <Select
              label="Kênh tiếp nhận"
              value={form.channel}
              onChange={(e) =>
                setForm((f) => ({ ...f, channel: e.target.value as LeadChannel }))
              }
            >
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Nhu cầu / Sản phẩm quan tâm
              </span>
              <input
                value={form.interest}
                onChange={(e) => setForm((f) => ({ ...f, interest: e.target.value }))}
                placeholder="VD: Bộ ấm chén gốm sứ cao cấp"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
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
              label="Trạng thái"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as LeadStatus }))
              }
              className="sm:col-span-2"
            >
              {LEAD_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ghi chú
              </span>
              <textarea
                value={form.note ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
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
                onClick={() => saveLead(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-alt"
              >
                <Plus size={16} />
                Lưu & nhập tiếp
              </button>
            )}
            <button
              onClick={() => saveLead(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98]"
            >
              <FloppyDisk size={16} />
              {editingId ? "Cập nhật" : "Lưu"}
            </button>
          </div>
        </div>
      )}

      {historyFor && (
        <Modal title={`Lịch sử — ${historyFor.customerName}`} onClose={() => setHistoryFor(null)}>
          <ul className="flex flex-col gap-3 text-sm">
            {historyEntries.map((entry) => (
              <li key={entry.id} className="border-l-2 border-border pl-3">
                <p className="text-ink-soft">
                  {entry.action === "create" && (
                    <>
                      Tạo lead bởi <strong>{entry.changedBy.name}</strong>
                    </>
                  )}
                  {entry.action === "update" && (
                    <>
                      {FIELD_LABEL[entry.field ?? ""] ?? entry.field}:{" "}
                      <strong>{entry.oldValue}</strong> → <strong>{entry.newValue}</strong>{" "}
                      (bởi {entry.changedBy.name})
                    </>
                  )}
                  {entry.action === "delete" && (
                    <>
                      Xoá bởi <strong>{entry.changedBy.name}</strong>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {new Date(entry.changedAt).toLocaleString("vi-VN")}
                </p>
              </li>
            ))}
            {historyEntries.length === 0 && (
              <li className="text-muted">Chưa có lịch sử.</li>
            )}
          </ul>
        </Modal>
      )}
    </div>
  );
}
