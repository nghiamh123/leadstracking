import { useEffect, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  Copy,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { useWebsites } from "../../lib/hooks";
import { hostingsApi, ApiError } from "../../lib/api";
import type { HostingAccount } from "../../lib/types";

interface HostingForm {
  websiteId: string;
  label: string;
  loginUrl: string;
  username: string;
  password: string;
  note: string;
}

const emptyForm: HostingForm = {
  websiteId: "",
  label: "Hosting",
  loginUrl: "",
  username: "",
  password: "",
  note: "",
};

const labelSuggestions = ["Hosting", "cPanel", "Tên miền", "WordPress admin", "VPS", "Email"];

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

function openHostingWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

/**
 * Ghi clipboard với nội dung có thể chưa sẵn sàng (mật khẩu đang tải từ API). Safari chỉ cho ghi
 * clipboard trong đúng lượt click, nên phải gọi write() ngay và truyền Promise vào ClipboardItem
 * thay vì await API xong rồi mới writeText (lúc đó Safari đã coi như hết "user gesture").
 */
async function copyToClipboard(text: string | Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = Promise.resolve(text).then((t) => new Blob([t], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  } else {
    await navigator.clipboard.writeText(await text);
  }
}

export function AdminHostings() {
  const { websites } = useWebsites();
  const [hostings, setHostings] = useState<HostingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HostingAccount | null>(null);
  const [form, setForm] = useState<HostingForm>(emptyForm);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mật khẩu đã giải mã chỉ giữ trong bộ nhớ trang, không lưu localStorage.
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  function reload() {
    return hostingsApi
      .list()
      .then((rows) => {
        setHostings(rows);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Không tải được danh sách."));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function getPassword(id: string): Promise<string> {
    if (passwords[id] !== undefined) return passwords[id];
    const { password } = await hostingsApi.revealPassword(id);
    setPasswords((p) => ({ ...p, [id]: password }));
    return password;
  }

  async function toggleVisible(h: HostingAccount) {
    setRowError(null);
    if (visible[h.id]) {
      setVisible((v) => ({ ...v, [h.id]: false }));
      return;
    }
    try {
      await getPassword(h.id);
      setVisible((v) => ({ ...v, [h.id]: true }));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Không xem được mật khẩu.");
    }
  }

  async function copy(key: string, text: string | Promise<string>) {
    setRowError(null);
    try {
      await copyToClipboard(text);
      setCopied(key);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Trình duyệt không cho phép copy.");
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, websiteId: websites[0]?.id ?? "" });
    setShowFormPassword(false);
    setError(null);
    setShowForm(true);
  }

  function openEdit(h: HostingAccount) {
    setEditing(h);
    setForm({
      websiteId: h.websiteId,
      label: h.label,
      loginUrl: h.loginUrl,
      username: h.username ?? "",
      password: "",
      note: h.note ?? "",
    });
    setShowFormPassword(false);
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    if (!form.websiteId || !form.loginUrl.trim()) {
      setError("Chọn website và nhập link hosting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = {
        websiteId: form.websiteId,
        label: form.label.trim() || "Hosting",
        loginUrl: form.loginUrl.trim(),
        username: form.username,
        note: form.note,
      };
      if (editing) {
        // Để trống ô mật khẩu khi sửa = giữ nguyên mật khẩu cũ.
        await hostingsApi.update(editing.id, form.password ? { ...data, password: form.password } : data);
        setPasswords((p) => {
          const next = { ...p };
          delete next[editing.id];
          return next;
        });
        setVisible((v) => ({ ...v, [editing.id]: false }));
      } else {
        await hostingsApi.create({ ...data, password: form.password || undefined });
      }
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(h: HostingAccount) {
    if (!window.confirm(`Xoá ${h.label} của ${h.website.name}? Không khôi phục được.`)) return;
    try {
      await hostingsApi.remove(h.id);
      await reload();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Không xoá được.");
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Link đăng nhập hosting của từng website. Bấm vào link để mở trang hosting ở cửa sổ mới,
          rồi copy mật khẩu dán vào.
        </p>
        <button
          onClick={openAdd}
          disabled={websites.length === 0}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-60"
        >
          <Plus size={16} />
          Thêm hosting
        </button>
      </div>

      {(loadError || rowError) && (
        <p className="rounded-lg bg-pale-red px-4 py-2 text-xs text-pale-red-ink">
          {loadError ?? rowError}
        </p>
      )}

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium">Link hosting</th>
                <th className="px-6 py-3 font-medium">Tài khoản</th>
                <th className="px-6 py-3 font-medium">Mật khẩu</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {!loading &&
                hostings.map((h) => (
                  <tr key={h.id} className="border-b border-border align-top last:border-0">
                    <td className="px-6 py-3">
                      <p className="font-medium text-ink-soft">{h.website.name}</p>
                      <p className="text-xs text-muted">{h.website.domain}</p>
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => openHostingWindow(h.loginUrl)}
                        title={h.loginUrl}
                        className="group inline-flex max-w-[260px] items-center gap-1.5 text-left text-ink-soft hover:text-ink"
                      >
                        <span className="truncate underline decoration-border underline-offset-4 group-hover:decoration-ink">
                          {displayHost(h.loginUrl)}
                        </span>
                        <ArrowSquareOut size={14} className="shrink-0" />
                      </button>
                      <p className="mt-0.5 text-xs text-muted">
                        {h.label}
                        {h.note && ` · ${h.note}`}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      {h.username ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-xs text-ink-soft">{h.username}</span>
                          <button
                            onClick={() => copy(`${h.id}:user`, h.username!)}
                            className="rounded p-1 text-muted hover:bg-surface-alt hover:text-ink"
                            aria-label="Copy tài khoản"
                          >
                            {copied === `${h.id}:user` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {h.hasPassword ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-xs text-ink-soft">
                            {visible[h.id] ? passwords[h.id] : "••••••••"}
                          </span>
                          <button
                            onClick={() => toggleVisible(h)}
                            className="rounded p-1 text-muted hover:bg-surface-alt hover:text-ink"
                            aria-label={visible[h.id] ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          >
                            {visible[h.id] ? <EyeSlash size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            onClick={() => copy(`${h.id}:pass`, getPassword(h.id))}
                            className="rounded p-1 text-muted hover:bg-surface-alt hover:text-ink"
                            aria-label="Copy mật khẩu"
                          >
                            {copied === `${h.id}:pass` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => openEdit(h)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                        >
                          <PencilSimple size={14} />
                          Sửa
                        </button>
                        <button
                          onClick={() => remove(h)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-pale-red-ink hover:opacity-80"
                        >
                          <Trash size={14} />
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && hostings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">
                    Chưa có hosting nào. Bấm “Thêm hosting” để lưu link và mật khẩu cho website.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal
          title={editing ? `Sửa — ${editing.website.name}` : "Thêm hosting"}
          onClose={() => setShowForm(false)}
        >
          <div className="flex flex-col gap-3">
            <Select
              label="Website"
              value={form.websiteId}
              onChange={(e) => setForm((f) => ({ ...f, websiteId: e.target.value }))}
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.domain})
                </option>
              ))}
            </Select>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Loại</span>
              <input
                value={form.label}
                list="hosting-label-suggestions"
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Hosting"
                className={inputClass}
              />
              <datalist id="hosting-label-suggestions">
                {labelSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Link đăng nhập hosting
              </span>
              <input
                value={form.loginUrl}
                onChange={(e) => setForm((f) => ({ ...f, loginUrl: e.target.value }))}
                placeholder="https://hosting.vidu.vn:2083"
                className={`${inputClass} font-mono text-xs`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Tài khoản
              </span>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Mật khẩu
              </span>
              <span className="relative flex">
                <input
                  type={showFormPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder={editing?.hasPassword ? "Để trống = giữ mật khẩu cũ" : ""}
                  className={`${inputClass} w-full pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowFormPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
                  aria-label={showFormPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showFormPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ghi chú
              </span>
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="VD: Nhà cung cấp, ngày hết hạn..."
                className={inputClass}
              />
            </label>
            {error && <p className="text-xs text-pale-red-ink">{error}</p>}
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm hosting"}
          </button>
        </Modal>
      )}
    </div>
  );
}
