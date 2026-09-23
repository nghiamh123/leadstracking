import { useEffect, useState } from "react";
import { BellSimple, Check, NotePencil, Trash } from "@phosphor-icons/react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { followupsApi, type LeadActivity, type LeadActivityType, type Reminder } from "../../lib/api";
import { useSession } from "../../lib/session";
import { ACTIVITY_LABEL, formatDateTime, localDate } from "./labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
const labelClass = "text-xs font-medium uppercase tracking-wider text-muted";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDate(d);
}

/**
 * Cửa sổ chăm sóc một khách: ghi lần liên hệ, đặt lịch nhắc, xem lịch sử liên hệ và
 * lịch nhắc đang chờ. `onChanged` báo cho nơi mở (vd mục "Việc cần làm") để tải lại.
 */
export function LeadCareModal({
  lead,
  onClose,
  onChanged,
}: {
  lead: { id: string; customerName: string };
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { currentUser } = useSession();
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [activityType, setActivityType] = useState<LeadActivityType>("call");
  const [activityNote, setActivityNote] = useState("");
  const [dueDate, setDueDate] = useState(tomorrow);
  const [dueTime, setDueTime] = useState("09:00");
  const [reminderNote, setReminderNote] = useState("");

  function load() {
    followupsApi
      .care(lead.id)
      .then((res) => {
        setActivities(res.activities);
        setReminders(res.reminders);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được dữ liệu"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [lead.id]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  function logActivity() {
    run(async () => {
      await followupsApi.logActivity(lead.id, { type: activityType, note: activityNote.trim() || undefined });
      setActivityNote("");
    });
  }

  function createReminder() {
    if (!reminderNote.trim()) {
      setError("Nhập nội dung cần nhắc");
      return;
    }
    run(async () => {
      await followupsApi.createReminder(lead.id, {
        dueAt: new Date(`${dueDate}T${dueTime}:00`).toISOString(),
        note: reminderNote.trim(),
      });
      setReminderNote("");
    });
  }

  return (
    <Modal title={`Chăm sóc — ${lead.customerName}`} onClose={onClose}>
      <div className="-mx-6 flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-6">
        <section className="flex flex-col gap-2">
          <p className={labelClass}>Ghi lần liên hệ</p>
          <div className="flex gap-2">
            <Select
              aria-label="Hình thức liên hệ"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as LeadActivityType)}
              className="w-32 shrink-0"
            >
              {(Object.keys(ACTIVITY_LABEL) as LeadActivityType[]).map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_LABEL[t]}
                </option>
              ))}
            </Select>
            <input
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              placeholder="Kết quả, vd: khách hẹn thứ 6 trả lời"
              maxLength={1000}
              className={`${inputClass} min-w-0 flex-1`}
            />
          </div>
          <button
            onClick={logActivity}
            disabled={busy}
            className="flex items-center justify-center gap-2 self-end rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-alt disabled:opacity-50"
          >
            <NotePencil size={14} />
            Ghi lại
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <p className={labelClass}>Đặt lịch nhắc</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              min={localDate(new Date())}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </div>
          <input
            value={reminderNote}
            onChange={(e) => setReminderNote(e.target.value)}
            placeholder="Việc cần làm, vd: gọi lại hỏi kết quả trình sếp"
            maxLength={500}
            className={inputClass}
          />
          <button
            onClick={createReminder}
            disabled={busy}
            className="flex items-center justify-center gap-2 self-end rounded-lg bg-ink px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            <BellSimple size={14} />
            Đặt nhắc
          </button>
        </section>

        {error && <p className="rounded-lg bg-pale-red px-3 py-2 text-xs text-pale-red-ink">{error}</p>}

        {loading ? (
          <p className="text-center text-sm text-muted">Đang tải...</p>
        ) : (
          <>
            {reminders.length > 0 && (
              <section className="flex flex-col gap-2">
                <p className={labelClass}>Lịch nhắc đang chờ</p>
                <ul className="flex flex-col gap-1.5">
                  {reminders.map((r) => {
                    const mine = r.userId === currentUser?.id;
                    return (
                      <li key={r.id} className="flex items-start gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-soft">{r.note}</p>
                          <p className="text-[11px] text-muted">
                            {formatDateTime(r.dueAt)}
                            {!mine && r.user && ` · của ${r.user.name}`}
                            {r.source === "assistant" && " · Trợ lý AI tạo"}
                          </p>
                        </div>
                        {mine && (
                          <>
                            <button
                              onClick={() => run(() => followupsApi.setDone(r.id, true))}
                              disabled={busy}
                              className="rounded-md p-1 text-muted hover:bg-surface hover:text-pale-green-ink"
                              aria-label="Đánh dấu xong"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => run(() => followupsApi.removeReminder(r.id))}
                              disabled={busy}
                              className="rounded-md p-1 text-muted hover:bg-surface hover:text-pale-red-ink"
                              aria-label="Xoá lịch nhắc"
                            >
                              <Trash size={14} />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2 pb-1">
              <p className={labelClass}>Lịch sử liên hệ</p>
              {activities.length === 0 ? (
                <p className="text-sm text-muted">Chưa ghi lần liên hệ nào.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {activities.map((a) => (
                    <li key={a.id} className="border-l-2 border-border pl-3">
                      <p className="text-ink-soft">
                        <strong className="font-medium">{ACTIVITY_LABEL[a.type]}</strong>
                        {a.note && ` — ${a.note}`}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDateTime(a.happenedAt)} · {a.user.name}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
