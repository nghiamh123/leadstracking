import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChatCircleText,
  CircleNotch,
  ClockCounterClockwise,
  PaperPlaneRight,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import { Modal } from "../components/ui/Modal";
import { Markdown } from "../components/assistant/Markdown";
import {
  ApiError,
  assistantApi,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantPersona,
  type AssistantPersonaKey,
  type AssistantStatus,
} from "../lib/api";
import { formatDateShort } from "../lib/format";

const PERSONA_UI: Record<AssistantPersonaKey, { intro: string; suggestions: string[] }> = {
  ops: {
    intro:
      "Hỏi về phễu bán hàng, hiệu quả từng kênh và đội sales. Trợ lý đọc số liệu lead, đơn hàng và traffic thật trong phạm vi bạn được xem.",
    suggestions: [
      "Tuần này đội sales nên ưu tiên xử lý việc gì?",
      "Ai đang có nhiều lead bị bỏ quên nhất?",
      "Kênh nào ra nhiều đơn nhất 3 tháng qua?",
      "So sánh tỉ lệ chốt đơn giữa các nhân viên sales",
    ],
  },
  seo: {
    intro:
      "Hỏi về traffic, từ khoá và hiệu quả chuyển đổi của các website. Trợ lý đọc số liệu thật từ Google Search Console và hệ thống lead.",
    suggestions: [
      "Từ khoá nào sắp lọt top 3 và đáng đầu tư nhất?",
      "Website nào traffic giảm so với 4 tuần trước?",
      "Keyword nào CTR thấp, cần sửa title/meta?",
      "Website nào nhiều traffic nhưng ít lead?",
    ],
  },
  sales: {
    intro:
      "Hỏi nên liên hệ khách nào trước, nhờ soạn tin nhắn, đặt lịch nhắc hoặc ghi lại lần vừa liên hệ. Trợ lý chỉ xem lead của chính bạn, không xem số điện thoại.",
    suggestions: [
      "Hôm nay nên liên hệ lại khách nào trước?",
      "Khách nào đã nhận báo giá mà chưa chốt?",
      "Soạn tin nhắn Zalo hỏi thăm khách đã nhận báo giá",
      "Tôi có lịch nhắc nào sắp tới?",
    ],
  },
};

const TOOL_LABELS: Record<string, string> = {
  list_websites: "Danh sách website",
  get_traffic_trend: "Xu hướng traffic",
  find_keyword_opportunities: "Cơ hội từ khoá",
  search_keywords: "Tìm từ khoá",
  find_cross_site_overlap: "Từ khoá trùng giữa các site",
  get_website_funnel: "Phễu chuyển đổi website",
  get_lead_funnel: "Phễu lead",
  get_team_workload: "Khối lượng việc đội sales",
  find_stale_leads: "Lead bị bỏ quên",
  list_my_open_leads: "Khách đang chăm sóc",
  search_my_leads: "Tìm khách",
  get_lead_detail: "Chi tiết khách",
  get_my_performance: "Kết quả bán hàng",
  list_my_reminders: "Lịch nhắc",
  create_reminder: "Tạo lịch nhắc",
  log_contact: "Ghi lần liên hệ",
};

/** Câu trả lời đang stream: phần chữ đã nhận + tool đang chạy (nếu có). */
interface Pending {
  text: string;
  toolLabel: string | null;
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : formatDateShort(iso);
}

function ConversationList({
  conversations,
  personas,
  activeId,
  disabled,
  retentionDays,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: AssistantConversation[];
  personas: AssistantPersona[];
  activeId: string | null;
  disabled: boolean;
  retentionDays: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={14} />
          Hội thoại mới
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted">Chưa có hội thoại nào.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group mb-0.5 flex items-center rounded-lg transition-colors ${
              c.id === activeId ? "bg-surface-alt" : "hover:bg-surface-alt"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              disabled={disabled}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left disabled:cursor-not-allowed"
            >
              <ChatCircleText size={14} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-soft">{c.title ?? "Hội thoại mới"}</span>
                {personas.length > 1 && (
                  <span className="block text-[11px] text-muted">
                    {personas.find((p) => p.key === c.persona)?.label ?? c.persona}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{formatUpdated(c.updatedAt)}</span>
            </button>
            <button
              onClick={() => onDelete(c.id)}
              disabled={disabled}
              className="mr-1 rounded-md p-1.5 text-muted opacity-100 hover:bg-surface hover:text-pale-red-ink disabled:hidden lg:opacity-0 lg:group-hover:opacity-100"
              aria-label="Xoá hội thoại"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>

      <p className="border-t border-border px-4 py-3 text-[11px] leading-snug text-muted">
        Hội thoại tự xoá sau {retentionDays} ngày không hoạt động.
      </p>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
      <Sparkle size={14} weight="fill" />
    </div>
  );
}

function MessageView({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-alt px-4 py-2.5 text-sm text-ink">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <Markdown text={message.text} />
        {message.toolsUsed.length > 0 && (
          <p className="mt-2 text-[11px] text-muted">
            Dữ liệu đã xem: {message.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function PendingView({ pending }: { pending: Pending }) {
  const label = pending.toolLabel ?? (pending.text ? null : "Đang suy nghĩ…");
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {pending.text && <Markdown text={pending.text} />}
        {label && (
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted">
            <CircleNotch size={12} className="animate-spin" />
            {label}
          </p>
        )}
      </div>
    </div>
  );
}

export function Assistant() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("c");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Trợ lý cho hội thoại mới (chỉ có ý nghĩa khi role dùng được nhiều trợ lý).
  const [newPersona, setNewPersona] = useState<AssistantPersonaKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Hội thoại vừa được tạo trong lúc gửi tin đầu tiên - không tải lại (sẽ xoá mất tin đang hiển thị).
  const justCreatedRef = useRef<string | null>(null);

  function refreshConversations() {
    assistantApi.conversations().then(setConversations).catch(() => {});
  }

  useEffect(() => {
    assistantApi
      .status()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được Trợ lý AI"));
    refreshConversations();
  }, []);

  useEffect(() => {
    setError(null);
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (justCreatedRef.current === activeId) {
      justCreatedRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    assistantApi
      .messages(activeId)
      .then((m) => !cancelled && setMessages(m))
      .catch((e) => {
        if (cancelled) return;
        setMessages([]);
        // Hội thoại đã bị xoá (hoặc link cũ) → quay về màn hình trống.
        if (e instanceof ApiError && e.status === 404) setSearchParams({}, { replace: true });
        else setError(e instanceof Error ? e.message : "Không tải được hội thoại");
      })
      .finally(() => !cancelled && setLoadingMessages(false));
    return () => {
      cancelled = true;
    };
  }, [activeId, setSearchParams]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  useEffect(resizeInput, [input]);

  function selectConversation(id: string | null) {
    setHistoryOpen(false);
    setSearchParams(id ? { c: id } : {});
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Xoá hội thoại này? Không khôi phục được.")) return;
    try {
      await assistantApi.remove(id);
      if (id === activeId) selectConversation(null);
      refreshConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được hội thoại");
    }
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || pending || !currentPersona) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text, toolsUsed: [], createdAt: new Date().toISOString() }]);
    setPending({ text: "", toolLabel: null });

    try {
      let id = activeId;
      if (!id) {
        id = (await assistantApi.createConversation(currentPersona!.key)).id;
        justCreatedRef.current = id;
        setSearchParams({ c: id }, { replace: true });
      }
      const reply = await assistantApi.send(id, text, {
        onText: (delta) =>
          setPending((p) => {
            if (!p) return p;
            // Chữ sau khi chạy tool là một đoạn mới - tách dòng như câu trả lời cuối cùng.
            const sep = p.toolLabel && p.text ? "\n\n" : "";
            return { text: p.text + sep + delta, toolLabel: null };
          }),
        onTool: (label) => setPending((p) => p && { ...p, toolLabel: label }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: reply.truncated
            ? `${reply.text}\n\n_(Câu trả lời quá dài nên bị cắt — hãy hỏi cụ thể hơn.)_`
            : reply.text,
          toolsUsed: reply.toolsUsed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStatus((s) => s && { ...s, usedToday: s.usedToday + 1 });
    } catch (e) {
      // Backend không lưu lượt lỗi → bỏ tin vừa gửi khỏi màn hình, trả nội dung về ô nhập để gửi lại.
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, thử lại sau.");
    } finally {
      setPending(null);
      refreshConversations();
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: bộ gõ tiếng Việt (Telex/VNI) đang ghép dấu - Enter lúc đó không phải để gửi.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const personas = status?.personas ?? [];
  const activeConversation = conversations.find((c) => c.id === activeId);
  // Hội thoại đang mở → trợ lý của nó; hội thoại mới → trợ lý đang chọn (mặc định là trợ lý đầu tiên).
  const currentPersona =
    personas.find((p) => p.key === (activeConversation?.persona ?? newPersona)) ?? personas[0];
  const ui = currentPersona ? PERSONA_UI[currentPersona.key] : null;

  const busy = pending !== null;
  const limitReached = status ? status.usedToday >= status.dailyLimit : false;
  const activeTitle = activeConversation?.title;
  const listProps = {
    conversations,
    personas,
    activeId,
    disabled: busy,
    retentionDays: status?.retentionDays ?? 90,
    onSelect: selectConversation,
    onNew: () => selectConversation(null),
    onDelete: deleteConversation,
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-105px)] min-h-[480px] max-w-6xl gap-4 sm:h-[calc(100dvh-121px)]">
      <aside className="hidden w-64 shrink-0 overflow-hidden rounded-xl border border-border bg-surface lg:block">
        <ConversationList {...listProps} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-alt lg:hidden"
            aria-label="Lịch sử hội thoại"
          >
            <ClockCounterClockwise size={18} />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
            {activeTitle ?? currentPersona?.label ?? "Trợ lý AI"}
          </p>
          {status && (
            <span className="shrink-0 text-[11px] text-muted">
              Còn {Math.max(0, status.dailyLimit - status.usedToday)}/{status.dailyLimit} tin hôm nay
            </span>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {loadingMessages && <p className="text-center text-sm text-muted">Đang tải...</p>}

            {!loadingMessages && messages.length === 0 && !busy && currentPersona && ui && (
              <div className="fade-up flex flex-col items-center gap-3 pt-6 text-center sm:pt-12">
                <AssistantAvatar />
                {/* Chọn trợ lý chỉ khi đang ở hội thoại mới và role dùng được nhiều trợ lý. */}
                {!activeId && personas.length > 1 && (
                  <div className="flex rounded-lg border border-border bg-surface-alt p-0.5 text-sm">
                    {personas.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => setNewPersona(p.key)}
                        className={`rounded-md px-3 py-1.5 transition-colors ${
                          p.key === currentPersona.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-soft"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <h2 className="font-serif text-2xl text-ink">{currentPersona.label}</h2>
                <p className="max-w-md text-sm text-muted">{ui.intro}</p>
                <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                  {ui.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={limitReached}
                      className="rounded-lg border border-border px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:bg-surface-alt disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageView key={`${m.createdAt}-${i}`} message={m} />
            ))}
            {pending && <PendingView pending={pending} />}
          </div>
        </div>

        <div className="border-t border-border p-3 sm:p-4">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p className="mb-2 rounded-lg bg-pale-red px-3 py-2 text-xs text-pale-red-ink">{error}</p>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-ink">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={4000}
                disabled={limitReached}
                placeholder={
                  limitReached
                    ? "Bạn đã dùng hết lượt hôm nay, quay lại vào ngày mai nhé."
                    : `Hỏi ${currentPersona?.label.toLowerCase() ?? "trợ lý"}…`
                }
                className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || limitReached || !input.trim() || !currentPersona}
                className="rounded-lg bg-ink p-2 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                aria-label="Gửi"
              >
                <PaperPlaneRight size={16} weight="fill" />
              </button>
            </div>
            <p className="mt-1.5 hidden text-[11px] text-muted sm:block">
              Enter để gửi · Shift+Enter xuống dòng · Trợ lý có thể sai, hãy kiểm tra số liệu quan trọng.
            </p>
          </div>
        </div>
      </section>

      {historyOpen && (
        <Modal title="Lịch sử hội thoại" onClose={() => setHistoryOpen(false)}>
          <div className="-mx-6 -mb-6 h-[60vh]">
            <ConversationList {...listProps} />
          </div>
        </Modal>
      )}
    </div>
  );
}
