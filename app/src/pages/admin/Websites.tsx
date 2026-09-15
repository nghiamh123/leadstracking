import { useState } from "react";
import { ArrowsClockwise, PencilSimple, Plus, UploadSimple } from "@phosphor-icons/react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useWebsites } from "../../lib/hooks";
import { websitesApi, ApiError } from "../../lib/api";
import type { Website } from "../../lib/types";

const statusTone: Record<Website["status"], "green" | "red" | "yellow"> = {
  connected: "green",
  error: "red",
  pending: "yellow",
};
const statusLabel: Record<Website["status"], string> = {
  connected: "Đã kết nối",
  error: "Lỗi tải CSV",
  pending: "Chưa cấu hình",
};

interface WebsiteForm {
  name: string;
  domain: string;
  gscProperty: string;
  trafficCsvUrl: string;
  keywordsCsvUrl: string;
}

const emptyForm: WebsiteForm = {
  name: "",
  domain: "",
  gscProperty: "",
  trafficCsvUrl: "",
  keywordsCsvUrl: "",
};

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function AdminWebsites() {
  const { websites, loading, reload } = useWebsites();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Website | null>(null);
  const [form, setForm] = useState<WebsiteForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [uploadTarget, setUploadTarget] = useState<Website | null>(null);
  const [uploadTraffic, setUploadTraffic] = useState<File | null>(null);
  const [uploadKeywords, setUploadKeywords] = useState<File | null>(null);
  const [uploadRangeStart, setUploadRangeStart] = useState(isoDaysAgo(28));
  const [uploadRangeEnd, setUploadRangeEnd] = useState(isoDaysAgo(1));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    traffic?: { ok: boolean; rows: number };
    keywords?: { ok: boolean; rows: number };
  } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  async function reconnect(id: string) {
    await websitesApi.reconnect(id);
    reload();
  }

  function openUpload(w: Website) {
    setUploadTarget(w);
    setUploadTraffic(null);
    setUploadKeywords(null);
    setUploadRangeStart(isoDaysAgo(28));
    setUploadRangeEnd(isoDaysAgo(1));
    setUploadError(null);
    setUploadResult(null);
  }

  async function submitUpload() {
    if (!uploadTarget || (!uploadTraffic && !uploadKeywords)) return;
    setUploadBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await websitesApi.uploadGscData(
        uploadTarget.id,
        { traffic: uploadTraffic ?? undefined, keywords: uploadKeywords ?? undefined },
        { start: uploadRangeStart, end: uploadRangeEnd },
      );
      setUploadResult(result);
      reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Tải lên thất bại.");
    } finally {
      setUploadBusy(false);
    }
  }

  function openEdit(w: Website) {
    setEditing(w);
    setForm({
      name: w.name,
      domain: w.domain,
      gscProperty: w.gscProperty,
      trafficCsvUrl: w.trafficCsvUrl ?? "",
      keywordsCsvUrl: w.keywordsCsvUrl ?? "",
    });
    setError(null);
  }

  async function submitEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await websitesApi.update(editing.id, {
        name: form.name,
        domain: form.domain,
        gscProperty: form.gscProperty,
        trafficCsvUrl: form.trafficCsvUrl || undefined,
        keywordsCsvUrl: form.keywordsCsvUrl || undefined,
      });
      setEditing(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  async function addWebsite() {
    if (!form.name.trim() || !form.domain.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await websitesApi.create({
        name: form.name,
        domain: form.domain,
        gscProperty: form.gscProperty || `sc-domain:${form.domain}`,
        trafficCsvUrl: form.trafficCsvUrl || undefined,
        keywordsCsvUrl: form.keywordsCsvUrl || undefined,
      });
      setForm(emptyForm);
      setShowAdd(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tạo được website.");
    } finally {
      setBusy(false);
    }
  }

  function renderFormFields() {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Tên website
          </span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="VD: Gốm Kiến Trúc Việt"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Domain
          </span>
          <input
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            placeholder="vidu.vn"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            GSC Property (tham khảo)
          </span>
          <input
            value={form.gscProperty}
            onChange={(e) => setForm((f) => ({ ...f, gscProperty: e.target.value }))}
            placeholder="sc-domain:vidu.vn"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Link CSV Traffic (Google Sheets Publish to web)
          </span>
          <input
            value={form.trafficCsvUrl}
            onChange={(e) => setForm((f) => ({ ...f, trafficCsvUrl: e.target.value }))}
            placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Link CSV Từ khóa (Google Sheets Publish to web)
          </span>
          <input
            value={form.keywordsCsvUrl}
            onChange={(e) => setForm((f) => ({ ...f, keywordsCsvUrl: e.target.value }))}
            placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono outline-none focus:border-ink"
          />
        </label>
        {error && <p className="text-xs text-pale-red-ink">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Danh sách website đang đồng bộ Traffic/Từ khóa từ Google Search Console (qua CSV).
        </p>
        <button
          onClick={() => {
            setForm(emptyForm);
            setError(null);
            setShowAdd(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98]"
        >
          <Plus size={16} />
          Thêm website
        </button>
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Tên website</th>
                <th className="px-6 py-3 font-medium">Domain</th>
                <th className="px-6 py-3 font-medium">Trạng thái</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {!loading &&
                websites.map((w) => (
                  <tr key={w.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 font-medium text-ink-soft">{w.name}</td>
                    <td className="px-6 py-3 text-muted">{w.domain}</td>
                    <td className="px-6 py-3">
                      <Badge tone={statusTone[w.status]}>{statusLabel[w.status]}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {w.status === "error" && (
                          <button
                            onClick={() => reconnect(w.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                          >
                            <ArrowsClockwise size={14} />
                            Thử lại
                          </button>
                        )}
                        <button
                          onClick={() => openUpload(w)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                        >
                          <UploadSimple size={14} />
                          Tải lên CSV
                        </button>
                        <button
                          onClick={() => openEdit(w)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                        >
                          <PencilSimple size={14} />
                          Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <Modal title="Thêm website" onClose={() => setShowAdd(false)}>
          {renderFormFields()}
          <button
            onClick={addWebsite}
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Đang lưu..." : "Thêm website"}
          </button>
        </Modal>
      )}

      {editing && (
        <Modal title={`Sửa — ${editing.name}`} onClose={() => setEditing(null)}>
          {renderFormFields()}
          <button
            onClick={submitEdit}
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </Modal>
      )}

      {uploadTarget && (
        <Modal title={`Tải lên CSV — ${uploadTarget.name}`} onClose={() => setUploadTarget(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted">
              Export trực tiếp từ Search Console thật (Performance report → Export → tải file
              CSV) rồi chọn lại ở đây. Dùng khi add-on Sheet/Apps Script không tự động được.
            </p>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                CSV Traffic (report theo Dates)
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadTraffic(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                CSV Từ khóa (report theo Queries)
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadKeywords(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </label>

            {uploadKeywords && (
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">
                    Từ ngày (khớp lúc export ở GSC)
                  </span>
                  <input
                    type="date"
                    value={uploadRangeStart}
                    onChange={(e) => setUploadRangeStart(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">
                    Đến ngày
                  </span>
                  <input
                    type="date"
                    value={uploadRangeEnd}
                    onChange={(e) => setUploadRangeEnd(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                </label>
              </div>
            )}

            {uploadError && <p className="text-xs text-pale-red-ink">{uploadError}</p>}
            {uploadResult && (
              <p className="text-xs text-green-700">
                {uploadResult.traffic && `Traffic: ${uploadResult.traffic.rows} dòng. `}
                {uploadResult.keywords && `Từ khóa: ${uploadResult.keywords.rows} dòng.`}
              </p>
            )}

            <button
              onClick={submitUpload}
              disabled={uploadBusy || (!uploadTraffic && !uploadKeywords)}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-60"
            >
              {uploadBusy ? "Đang tải lên..." : "Tải lên"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
