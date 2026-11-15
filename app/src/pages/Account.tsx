import { useState } from "react";
import { CheckCircle, EnvelopeSimple, Warning } from "@phosphor-icons/react";
import { roleLabels, useSession } from "../lib/session";
import { authApi, ApiError, type NotificationSettings } from "../lib/api";
import { Badge } from "../components/ui/Badge";
import type { Role } from "../lib/types";

const NOTIFY_OPTIONS: { key: keyof NotificationSettings; label: string; hint: string; roles?: Role[] }[] = [
  {
    key: "notifyTickets",
    label: "Ticket",
    hint: "Khi bạn được giao ticket, ticket của bạn đổi trạng thái hoặc có bình luận mới.",
  },
  {
    key: "notifyReminders",
    label: "Nhắc chăm sóc khách",
    hint: "Khi lịch nhắc bạn đặt trên trang Lead đến hạn mà chưa làm.",
    roles: ["admin", "manager", "sales"],
  },
  {
    key: "notifyDailyDigest",
    label: "Tóm tắt cuối ngày",
    hint: "17:30 thứ 2 - thứ 7: số lead đã nhập, lần chăm sóc và việc tồn. Nhắc nếu hôm nay chưa nhập liệu.",
    roles: ["sales"],
  },
];

const card = "rounded-xl border border-border bg-surface p-6";
const input =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink";

export function Account() {
  const { currentUser, setCurrentUser } = useSession();
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  if (!currentUser) return null;
  const verified = !!currentUser.emailVerifiedAt;
  const options = NOTIFY_OPTIONS.filter((o) => !o.roles || o.roles.includes(currentUser.role));

  async function sendVerification() {
    setSendState("sending");
    setSendError(null);
    try {
      await authApi.sendVerification();
      setSendState("sent");
    } catch (err) {
      setSendState("idle");
      setSendError(err instanceof ApiError ? err.message : "Không gửi được email, thử lại sau.");
    }
  }

  async function toggle(key: keyof NotificationSettings, value: boolean) {
    setSavingKey(key);
    setSettingsError(null);
    try {
      setCurrentUser(await authApi.updateNotificationSettings({ [key]: value }));
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Không lưu được, thử lại sau.");
    } finally {
      setSavingKey(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    if (pw.next.length < 8) return setPwError("Mật khẩu mới phải có ít nhất 8 ký tự");
    if (pw.next !== pw.confirm) return setPwError("Nhập lại mật khẩu mới không khớp");
    setPwSaving(true);
    try {
      await authApi.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwDone(true);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Không đổi được mật khẩu, thử lại sau.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <section className={card}>
        <h2 className="font-serif text-lg text-ink">Email nhận thông báo</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="break-all text-sm text-ink-soft">{currentUser.email}</span>
          {verified ? <Badge tone="green">Đã xác minh</Badge> : <Badge tone="yellow">Chưa xác minh</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted">
          {currentUser.name} · {roleLabels[currentUser.role]}
        </p>

        {!verified && (
          <div className="mt-4 rounded-lg bg-pale-yellow p-4 text-sm text-pale-yellow-ink">
            <p>
              Bạn cần xác minh email thì hệ thống mới gửi thông báo. Bấm nút bên dưới, sau đó mở hộp thư (cả mục
              Spam) và bấm vào link trong email.
            </p>
            {sendState === "sent" ? (
              <p className="mt-3 flex items-center gap-1.5 font-medium">
                <CheckCircle size={16} />
                Đã gửi. Link có hiệu lực trong 24 giờ.
              </p>
            ) : (
              <button
                onClick={sendVerification}
                disabled={sendState === "sending"}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                <EnvelopeSimple size={16} />
                {sendState === "sending" ? "Đang gửi..." : "Gửi email xác minh"}
              </button>
            )}
            {sendError && <p className="mt-2 text-xs text-pale-red-ink">{sendError}</p>}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-serif text-lg text-ink">Loại email thông báo</h2>
        {!verified && <p className="mt-1 text-xs text-muted">Chỉ có hiệu lực sau khi email đã được xác minh.</p>}
        <ul className="mt-4 divide-y divide-border">
          {options.map((o) => (
            <li key={o.key} className="flex items-start justify-between gap-4 py-3">
              <label htmlFor={o.key} className="min-w-0 cursor-pointer">
                <p className="text-sm font-medium text-ink-soft">{o.label}</p>
                <p className="mt-0.5 text-xs text-muted">{o.hint}</p>
              </label>
              <input
                id={o.key}
                type="checkbox"
                checked={currentUser[o.key]}
                disabled={savingKey === o.key}
                onChange={(e) => toggle(o.key, e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-ink"
              />
            </li>
          ))}
        </ul>
        {settingsError && <p className="mt-2 text-xs text-pale-red-ink">{settingsError}</p>}
      </section>

      <section className={card}>
        <h2 className="font-serif text-lg text-ink">Đổi mật khẩu</h2>
        <form onSubmit={changePassword} className="mt-4 flex flex-col gap-3 sm:max-w-sm">
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Mật khẩu hiện tại"
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
            className={input}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            className={input}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className={input}
          />
          {pwError && (
            <p className="flex items-center gap-1.5 text-xs text-pale-red-ink">
              <Warning size={14} />
              {pwError}
            </p>
          )}
          {pwDone && (
            <p className="flex items-center gap-1.5 text-xs text-pale-green-ink">
              <CheckCircle size={14} />
              Đã đổi mật khẩu.
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="self-start rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pwSaving ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>
        </form>
      </section>
    </div>
  );
}
