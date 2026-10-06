import { useEffect, useState } from "react";
import { ChatCircle, MagnifyingGlass, PaperPlaneRight, Paperclip, Plus, Trash, Warning } from "@phosphor-icons/react";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Pagination, DEFAULT_PAGE_SIZE_OPTIONS } from "../components/ui/Pagination";
import { ImageAdder } from "../components/tickets/ImageAdder";
import { PendingImageThumb, ServerImageThumb } from "../components/tickets/ImageViews";
import { MAX_TICKET_IMAGES } from "../lib/image";
import { useWebsites } from "../lib/hooks";
import { useSession } from "../lib/session";
import {
  ApiError,
  ticketsApi,
  usersApi,
  type Ticket,
  type TicketDetail,
  type TicketInput,
  type TicketsPage,
} from "../lib/api";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_OPTIONS,
  TICKET_CATEGORY_LABEL,
  TICKET_CATEGORY_OPTIONS,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_OPTIONS,
} from "../lib/enumMap";
import type { AppUser, Role, TicketCategory, TicketPriority, TicketStatus } from "../lib/types";
import { formatDateTime } from "../lib/format";

type Tone = "red" | "blue" | "green" | "yellow" | "ink" | "neutral";

const statusTone: Record<TicketStatus, Tone> = {
  open: "blue",
  in_progress: "yellow",
  resolved: "green",
  closed: "neutral",
};

const priorityTone: Record<TicketPriority, Tone> = {
  low: "neutral",
  medium: "blue",
  high: "yellow",
  urgent: "red",
};

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

const emptyForm: TicketInput = {
  title: "",
  description: "",
  category: "bug",
  priority: "medium",
  websiteId: "",
  pageUrl: "",
};

export function Tickets() {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === "admin";
  const { websites } = useWebsites();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusCounts, setStatusCounts] = useState<TicketsPage["statusCounts"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<"all" | TicketStatus>("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE_OPTIONS[0]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Gõ xong mới tìm, tránh gọi API mỗi phím.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterPriority, filterCategory, filterDepartment, search, pageSize]);

  function reload() {
    setLoading(true);
    setLoadError(null);
    return ticketsApi
      .list({
        status: filterStatus === "all" ? undefined : filterStatus,
        priority: filterPriority === "all" ? undefined : (filterPriority as TicketPriority),
        category: filterCategory === "all" ? undefined : (filterCategory as TicketCategory),
        department: filterDepartment === "all" ? undefined : (filterDepartment as Role),
        search: search || undefined,
        page,
        pageSize,
      })
      .then((res) => {
        setTickets(res.data);
        setStatusCounts(res.statusCounts);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Không tải được danh sách ticket."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterPriority, filterCategory, filterDepartment, search, page, pageSize]);

  const allCount = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;
  const colCount = isAdmin ? 8 : 7;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          {isAdmin
            ? "Tất cả ticket các bộ phận gửi lên. Nhận xử lý, đổi trạng thái và phản hồi tại đây."
            : "Gặp lỗi hoặc cần dev hỗ trợ? Tạo ticket, mô tả rõ các bước để dev tái hiện và theo dõi tiến độ tại đây."}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98]"
        >
          <Plus size={16} />
          Tạo ticket
        </button>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-pale-yellow bg-pale-yellow/40 p-4 text-sm text-pale-yellow-ink">
          <span className="flex items-start gap-2">
            <Warning size={16} className="mt-0.5 shrink-0" />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} className="text-xs underline">
            Đóng
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">
        {(["all", ...TICKET_STATUS_OPTIONS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
              filterStatus === s ? "bg-ink text-white" : "text-ink-soft hover:bg-surface-alt"
            }`}
          >
            {s === "all" ? "Tất cả" : TICKET_STATUS_LABEL[s]}
            {statusCounts && (
              <span className={`text-xs tabular-nums ${filterStatus === s ? "text-white/70" : "text-muted"}`}>
                {s === "all" ? allCount : statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex w-full flex-col gap-1 sm:w-56">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Tìm kiếm</span>
          <span className="relative inline-flex">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tiêu đề hoặc mã #12"
              className={`${inputClass} w-full pl-8`}
            />
          </span>
        </label>
        <Select label="Mức độ" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="w-full sm:w-40">
          <option value="all">Tất cả</option>
          {TICKET_PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <Select label="Loại" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full sm:w-48">
          <option value="all">Tất cả</option>
          {TICKET_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {TICKET_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        {isAdmin && (
          <Select
            label="Bộ phận"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="all">Tất cả</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Mã</th>
                <th className="px-6 py-3 font-medium">Tiêu đề</th>
                {isAdmin && <th className="px-6 py-3 font-medium">Bộ phận</th>}
                <th className="px-6 py-3 font-medium">Mức độ</th>
                <th className="px-6 py-3 font-medium">Trạng thái</th>
                <th className="px-6 py-3 font-medium">Người xử lý</th>
                <th className="px-6 py-3 font-medium">Tạo lúc</th>
                <th className="px-6 py-3 font-medium">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setOpenId(t.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-alt"
                  >
                    <td className="px-6 py-3 tabular-nums text-muted">#{t.number}</td>
                    <td className="max-w-sm px-6 py-3">
                      <p className="truncate font-medium text-ink-soft">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{TICKET_CATEGORY_LABEL[t.category]}</span>
                        {t.website && <span>· {t.website.name}</span>}
                        {t._count.comments > 0 && (
                          <span className="flex items-center gap-1">
                            · <ChatCircle size={12} /> {t._count.comments}
                          </span>
                        )}
                        {t._count.images > 0 && (
                          <span className="flex items-center gap-1">
                            · <Paperclip size={12} /> {t._count.images}
                          </span>
                        )}
                      </p>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-3 text-muted">
                        {DEPARTMENT_LABEL[t.department]}
                        <p className="text-xs">{t.createdBy.name}</p>
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <Badge tone={priorityTone[t.priority]}>{TICKET_PRIORITY_LABEL[t.priority]}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <Badge tone={statusTone[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                    </td>
                    <td className="px-6 py-3 text-muted">{t.assignee?.name ?? "—"}</td>
                    <td className="px-6 py-3 text-muted">{formatDateTime(t.createdAt)}</td>
                    <td className="px-6 py-3 text-muted">{formatDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              {loading && (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-center text-pale-red-ink">
                    {loadError}
                  </td>
                </tr>
              )}
              {!loading && !loadError && tickets.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-center text-muted">
                    Chưa có ticket nào phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="ticket"
          />
        )}
      </div>

      {creating && (
        <CreateTicketModal
          websites={websites}
          onClose={() => setCreating(false)}
          onCreated={(t, uploadErrors) => {
            setCreating(false);
            setFilterStatus("all");
            setNotice(
              uploadErrors.length > 0
                ? `Ticket #${t.number} đã tạo nhưng ${uploadErrors.length} ảnh tải lên lỗi (${uploadErrors.join("; ")}). Mở ticket để thêm lại ảnh.`
                : null,
            );
            reload();
            setOpenId(t.id);
          }}
        />
      )}

      {openId && (
        <TicketDetailModal
          id={openId}
          isAdmin={!!isAdmin}
          currentUserId={currentUser!.id}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CreateTicketModal({
  websites,
  onClose,
  onCreated,
}: {
  websites: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (ticket: Ticket, uploadErrors: string[]) => void;
}) {
  const [form, setForm] = useState<TicketInput>(emptyForm);
  const [images, setImages] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Nhập tiêu đề ngắn gọn";
    if (!form.description.trim()) errs.description = "Mô tả lỗi để dev có thể tái hiện";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const ticket = await ticketsApi.create({
        ...form,
        websiteId: form.websiteId || undefined,
        pageUrl: form.pageUrl?.trim() || undefined,
      });
      // Ticket đã tạo; ảnh tải lên từng cái một, ảnh lỗi không làm mất ticket.
      const uploadErrors: string[] = [];
      for (const file of images) {
        try {
          await ticketsApi.uploadImage(ticket.id, file);
        } catch (err) {
          uploadErrors.push(`${file.name}: ${err instanceof ApiError ? err.message : "lỗi mạng"}`);
        }
      }
      onCreated(ticket, uploadErrors);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không gửi được ticket, thử lại.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Tạo ticket mới" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Tiêu đề</span>
          <input
            value={form.title}
            maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="VD: Không lưu được lead khi chọn kênh Zalo"
            className={inputClass}
          />
          {errors.title && <span className="text-xs text-pale-red-ink">{errors.title}</span>}
        </label>

        <Select
          label="Loại vấn đề"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as TicketCategory }))}
        >
          {TICKET_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {TICKET_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        <Select
          label="Mức độ"
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TicketPriority }))}
        >
          {TICKET_PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>

        <Select
          label="Website liên quan (nếu có)"
          value={form.websiteId ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, websiteId: e.target.value }))}
        >
          <option value="">Không / lỗi của phần mềm này</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Trang gặp lỗi</span>
          <input
            value={form.pageUrl ?? ""}
            maxLength={500}
            onChange={(e) => setForm((f) => ({ ...f, pageUrl: e.target.value }))}
            placeholder="VD: /leads hoặc https://..."
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Mô tả chi tiết</span>
          <textarea
            value={form.description}
            maxLength={5000}
            rows={6}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={"Các bước làm để gặp lỗi:\n1. ...\n2. ...\n\nKết quả mong đợi / kết quả thực tế:"}
            className={`${inputClass} resize-y`}
          />
          {errors.description && <span className="text-xs text-pale-red-ink">{errors.description}</span>}
        </label>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Hình ảnh minh hoạ ({images.length}/{MAX_TICKET_IMAGES})
          </span>
          <ImageAdder
            remaining={MAX_TICKET_IMAGES - images.length}
            disabled={saving}
            onFiles={(files) => setImages((prev) => [...prev, ...files])}
            onError={setImageError}
          >
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((file, i) => (
                  <PendingImageThumb
                    key={`${file.name}-${file.size}-${i}`}
                    file={file}
                    onRemove={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </ImageAdder>
          {imageError && <span className="text-xs text-pale-red-ink">{imageError}</span>}
          <span className="text-xs text-muted">
            Ảnh được tự xoá sau 3 ngày kể từ khi ticket hoàn thành.
          </span>
        </div>
      </div>

      {formError && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-pale-red-ink">
          <Warning size={14} />
          {formError}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm text-ink-soft hover:bg-surface-alt"
        >
          Huỷ
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
        >
          <PaperPlaneRight size={16} />
          {saving ? "Đang gửi..." : "Gửi ticket"}
        </button>
      </div>
    </Modal>
  );
}

function TicketDetailModal({
  id,
  isAdmin,
  currentUserId,
  onClose,
  onChanged,
}: {
  id: string;
  isAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [admins, setAdmins] = useState<AppUser[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ticketsApi
      .get(id)
      .then(setTicket)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được ticket."));
  }, [id]);

  // Chỉ admin gọi được danh sách người dùng; người xử lý (dev) cũng là admin.
  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .list()
      .then((users) => setAdmins(users.filter((u) => u.role === "admin" && u.status === "active")))
      .catch(() => {});
  }, [isAdmin]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setTicket(await ticketsApi.get(id));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    const body = comment.trim();
    if (!body) return;
    await run(async () => {
      await ticketsApi.comment(id, body);
      setComment("");
    });
  }

  async function remove() {
    if (!window.confirm("Xoá hẳn ticket này cùng toàn bộ bình luận?")) return;
    setBusy(true);
    try {
      await ticketsApi.remove(id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không xoá được ticket.");
      setBusy(false);
    }
  }

  const isOwner = ticket?.createdBy.id === currentUserId;
  const [imageError, setImageError] = useState<string | null>(null);
  // Quyền thao tác tính ở một chỗ; nút nào không được phép thì vô hiệu hoá kèm lý do (backend vẫn chặn lại).
  const canManageImages = isAdmin || isOwner;
  const imagesLockedReason =
    ticket && (ticket.status === "resolved" || ticket.status === "closed")
      ? "Ticket đã hoàn thành nên không thêm ảnh được. Mở lại ticket nếu cần bổ sung."
      : undefined;
  const adminOnlyHint = "Chỉ admin (dev) được thao tác";
  const assigneeOptions =
    ticket?.assignee && !admins.some((u) => u.id === ticket.assignee!.id)
      ? [{ id: ticket.assignee.id, name: ticket.assignee.name }, ...admins]
      : admins;

  async function uploadImages(files: File[]) {
    await run(async () => {
      for (const file of files) await ticketsApi.uploadImage(id, file);
    });
  }

  return (
    <Modal title={ticket ? `#${ticket.number} · ${ticket.title}` : "Ticket"} onClose={onClose} wide>
      {!ticket && !error && <p className="py-8 text-center text-sm text-muted">Đang tải...</p>}

      {ticket && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
            <Badge tone={priorityTone[ticket.priority]}>{TICKET_PRIORITY_LABEL[ticket.priority]}</Badge>
            <Badge>{TICKET_CATEGORY_LABEL[ticket.category]}</Badge>
          </div>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
            <Info label="Người tạo">
              {ticket.createdBy.name} · {DEPARTMENT_LABEL[ticket.department]}
            </Info>
            <Info label="Tạo lúc">{formatDateTime(ticket.createdAt)}</Info>
            <Info label="Website">{ticket.website?.name ?? "—"}</Info>
            <Info label="Trang gặp lỗi">{ticket.pageUrl ?? "—"}</Info>
            <Info label="Người xử lý">{ticket.assignee?.name ?? "Chưa có"}</Info>
            <Info label="Xử lý xong lúc">{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : "—"}</Info>
          </dl>

          <Section title="Mô tả">
            <p className="whitespace-pre-wrap rounded-lg bg-surface-alt p-4 text-sm leading-relaxed text-ink-soft">
              {ticket.description}
            </p>
          </Section>

          {(ticket.images.length > 0 || canManageImages || ticket.imagesPurgedAt) && (
            <Section title={`Hình ảnh (${ticket.images.length}/${MAX_TICKET_IMAGES})`}>
              {(() => {
                const gallery =
                  ticket.images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {ticket.images.map((img) => (
                        <ServerImageThumb
                          key={img.id}
                          ticketId={id}
                          image={img}
                          onRemove={
                            canManageImages && !busy
                              ? () => run(() => ticketsApi.removeImage(id, img.id))
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : null;
                return canManageImages ? (
                  <ImageAdder
                    remaining={MAX_TICKET_IMAGES - ticket.images.length}
                    disabled={busy}
                    disabledReason={imagesLockedReason}
                    onFiles={uploadImages}
                    onError={setImageError}
                  >
                    {gallery}
                  </ImageAdder>
                ) : (
                  gallery
                );
              })()}
              {imageError && <p className="mt-2 text-xs text-pale-red-ink">{imageError}</p>}
              <p className="mt-2 text-xs text-muted">
                {ticket.images.length === 0 && ticket.imagesPurgedAt
                  ? "Ảnh đính kèm đã được xoá tự động sau 3 ngày kể từ khi ticket hoàn thành."
                  : ticket.resolvedAt
                    ? `Ảnh sẽ tự xoá vào ${formatDateTime(
                        new Date(new Date(ticket.resolvedAt).getTime() + 3 * 86_400_000).toISOString(),
                      )}.`
                    : "Ảnh được giữ đến 3 ngày sau khi ticket hoàn thành."}
              </p>
            </Section>
          )}

          <Section title="Xử lý">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Trạng thái"
                value={ticket.status}
                disabled={busy || !isAdmin}
                title={isAdmin ? undefined : adminOnlyHint}
                onChange={(e) => run(() => ticketsApi.update(id, { status: e.target.value as TicketStatus }))}
              >
                {TICKET_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Select
                label="Mức độ"
                value={ticket.priority}
                disabled={busy || !isAdmin}
                title={isAdmin ? undefined : adminOnlyHint}
                onChange={(e) => run(() => ticketsApi.update(id, { priority: e.target.value as TicketPriority }))}
              >
                {TICKET_PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
              <Select
                label="Người xử lý"
                value={ticket.assignee?.id ?? ""}
                disabled={busy || !isAdmin}
                title={isAdmin ? undefined : adminOnlyHint}
                onChange={(e) => run(() => ticketsApi.update(id, { assigneeId: e.target.value }))}
              >
                <option value="">Chưa gán</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                disabled={busy || !isAdmin || ticket.assignee?.id === currentUserId}
                title={!isAdmin ? adminOnlyHint : ticket.assignee?.id === currentUserId ? "Bạn đang xử lý ticket này" : undefined}
                onClick={() =>
                  run(() =>
                    ticketsApi.update(id, {
                      assigneeId: currentUserId,
                      status: ticket.status === "open" ? "in_progress" : undefined,
                    }),
                  )
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {ticket.assignee?.id === currentUserId ? "Bạn đang xử lý" : "Nhận xử lý"}
              </button>
              {!isAdmin && (
                <span className="text-xs text-muted">
                  Chỉ admin (dev) được nhận xử lý và đổi trạng thái, mức độ ticket.
                </span>
              )}
            </div>
          </Section>

          {!isAdmin && (
            <Section title="Xác nhận">
              <p className="mb-3 text-sm text-muted">
                {ticket.status === "open" && "Chưa có ai nhận xử lý."}
                {ticket.status === "in_progress" &&
                  "Dev đang xử lý. Bạn bổ sung thông tin ở phần Trao đổi bên dưới."}
                {ticket.status === "resolved" && "Dev báo đã xử lý xong. Bạn kiểm tra lại giúp nhé."}
                {ticket.status === "closed" && "Ticket đã đóng. Nếu vẫn còn lỗi, bạn có thể mở lại."}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  disabled={busy || ticket.status === "closed"}
                  title={ticket.status === "closed" ? "Ticket đã đóng" : undefined}
                  onClick={() => run(() => ticketsApi.update(id, { status: "closed" }))}
                  className="rounded-lg bg-ink px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ticket.status === "resolved" ? "Xác nhận & đóng ticket" : "Đóng ticket"}
                </button>
                <button
                  disabled={busy || (ticket.status !== "resolved" && ticket.status !== "closed")}
                  title={
                    ticket.status === "resolved" || ticket.status === "closed"
                      ? undefined
                      : "Chỉ mở lại được khi dev đã xử lý xong hoặc ticket đã đóng"
                  }
                  onClick={() => run(() => ticketsApi.update(id, { status: "open" }))}
                  className="rounded-lg border border-border px-3 py-1.5 text-ink-soft hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Chưa xong, mở lại
                </button>
              </div>
            </Section>
          )}

          <Section title={`Trao đổi (${ticket.comments.length})`}>
            <ul className="flex flex-col gap-3">
              {ticket.comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-ink-soft">{c.user.name}</span>
                    {c.user.role === "admin" && <Badge tone="ink">Dev</Badge>}
                    <span>{formatDateTime(c.createdAt)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-ink-soft">{c.body}</p>
                </li>
              ))}
              {ticket.comments.length === 0 && <li className="text-sm text-muted">Chưa có trao đổi nào.</li>}
            </ul>

            <div className="mt-4 flex flex-col gap-2">
              <textarea
                value={comment}
                rows={3}
                maxLength={3000}
                onChange={(e) => setComment(e.target.value)}
                placeholder={isAdmin ? "Phản hồi cho người báo lỗi..." : "Bổ sung thông tin cho dev..."}
                className={`${inputClass} resize-y`}
              />
              <button
                disabled={busy || !comment.trim()}
                onClick={sendComment}
                className="flex items-center gap-2 self-end rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
              >
                <PaperPlaneRight size={16} />
                Gửi
              </button>
            </div>
          </Section>

          <div className="border-t border-border pt-4">
            <button
              disabled={busy || !isAdmin}
              title={isAdmin ? undefined : "Chỉ admin được xoá ticket"}
              onClick={remove}
              className="flex items-center gap-1.5 text-xs text-muted enabled:hover:text-pale-red-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash size={14} />
              Xoá ticket
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-pale-red-ink">
          <Warning size={14} />
          {error}
        </p>
      )}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{title}</h4>
      {children}
    </section>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="break-words text-ink-soft">{children}</dd>
    </div>
  );
}
