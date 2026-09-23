import { useEffect, useState } from "react";
import { BellSimple, Check } from "@phosphor-icons/react";
import { followupsApi, type Reminder } from "../../lib/api";
import { LeadCareModal } from "./LeadCareModal";
import { localDate } from "./labels";

const UPCOMING_DAYS = 7;

function dueLabel(iso: string, today: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = localDate(d);
  if (day === today) return time;
  const [, m, dd] = day.split("-");
  return `${dd}/${m} ${time}`;
}

/**
 * Mục "Việc cần làm": lịch nhắc chăm sóc khách của chính người dùng - quá hạn, hôm nay
 * và {UPCOMING_DAYS} ngày tới. Không có lịch nào thì không hiện gì (tránh chiếm chỗ).
 * `refreshKey` đổi giá trị → tải lại (vd sau khi đặt nhắc ở nơi khác trên trang).
 */
export function TodayTasks({ refreshKey = 0 }: { refreshKey?: number }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [openLead, setOpenLead] = useState<{ id: string; customerName: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    followupsApi.myReminders().then(setReminders).catch(() => setReminders([]));
  }, [refreshKey, reload]);

  const today = localDate(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + UPCOMING_DAYS);
  const horizonDay = localDate(horizon);

  const overdue = reminders.filter((r) => localDate(new Date(r.dueAt)) < today);
  const dueToday = reminders.filter((r) => localDate(new Date(r.dueAt)) === today);
  const upcoming = reminders.filter((r) => {
    const day = localDate(new Date(r.dueAt));
    return day > today && day <= horizonDay;
  });

  if (overdue.length + dueToday.length + upcoming.length === 0) return null;

  async function markDone(id: string) {
    setReminders((rs) => rs.filter((r) => r.id !== id));
    try {
      await followupsApi.setDone(id, true);
    } catch {
      setReload((n) => n + 1);
    }
  }

  const groups: { title: string; items: Reminder[]; tone: string }[] = [
    { title: "Quá hạn", items: overdue, tone: "text-pale-red-ink" },
    { title: "Hôm nay", items: dueToday, tone: "text-ink" },
    { title: `${UPCOMING_DAYS} ngày tới`, items: upcoming, tone: "text-muted" },
  ];

  return (
    <div className="fade-up rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <BellSimple size={16} className="text-ink" />
        <h2 className="font-serif text-lg text-ink">Việc cần làm</h2>
        {overdue.length > 0 && (
          <span className="rounded-full bg-pale-red px-2 py-0.5 text-[11px] font-medium text-pale-red-ink">
            {overdue.length} quá hạn
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="min-w-0">
            <p className={`mb-1.5 text-xs font-medium uppercase tracking-wider ${g.tone}`}>
              {g.title} · {g.items.length}
            </p>
            {g.items.length === 0 ? (
              <p className="text-xs text-muted">Không có.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {g.items.slice(0, 6).map((r) => (
                  <li key={r.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-alt">
                    <button
                      onClick={() => markDone(r.id)}
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-transparent hover:border-ink hover:text-ink"
                      aria-label="Đánh dấu xong"
                    >
                      <Check size={10} weight="bold" />
                    </button>
                    <button
                      onClick={() => r.lead && setOpenLead(r.lead)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm text-ink-soft">
                        <strong className="font-medium">{r.lead?.customerName}</strong> — {r.note}
                      </span>
                      <span className="text-[11px] text-muted">{dueLabel(r.dueAt, today)}</span>
                    </button>
                  </li>
                ))}
                {g.items.length > 6 && (
                  <li className="px-2 text-xs text-muted">+{g.items.length - 6} việc khác</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {openLead && (
        <LeadCareModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}
