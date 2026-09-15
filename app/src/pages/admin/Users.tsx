import { useState } from "react";
import { Key, Plus } from "@phosphor-icons/react";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { roleLabels } from "../../lib/session";
import { useUsers } from "../../lib/hooks";
import { usersApi, ApiError } from "../../lib/api";
import type { AppUser, Role } from "../../lib/types";

const roleTone: Record<Role, "ink" | "blue" | "green" | "yellow"> = {
  admin: "ink",
  manager: "blue",
  sales: "green",
  seo: "yellow",
};

const statusLabel: Record<AppUser["status"], string> = {
  active: "Đang hoạt động",
  invited: "Đã mời",
  disabled: "Đã khoá",
};

export function AdminUsers() {
  const { users, loading, reload } = useUsers();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "sales" as Role,
    team: "",
    password: "",
  });
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  async function updateRole(id: string, role: Role) {
    await usersApi.updateRole(id, role);
    reload();
  }

  async function updateStatus(id: string, status: AppUser["status"]) {
    await usersApi.updateStatus(id, status);
    reload();
  }

  async function invite() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) return;
    setInviteError(null);
    try {
      await usersApi.invite(form);
      setForm({ name: "", email: "", role: "sales", team: "", password: "" });
      setShowInvite(false);
      reload();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Không tạo được tài khoản.");
    }
  }

  async function submitReset() {
    if (!resetFor || newPassword.length < 8) return;
    setResetError(null);
    try {
      await usersApi.resetPassword(resetFor.id, newPassword);
      setResetDone(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Không đặt lại được mật khẩu.");
    }
  }

  function closeReset() {
    setResetFor(null);
    setNewPassword("");
    setResetError(null);
    setResetDone(false);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Quản lý tài khoản và phân quyền theo vai trò trong hệ thống.
        </p>
        <button
          onClick={() => {
            setInviteError(null);
            setShowInvite(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white active:scale-[0.98]"
        >
          <Plus size={16} />
          Thêm người dùng
        </button>
      </div>

      <div className="fade-up overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-6 py-3 font-medium">Họ tên</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Team</th>
                <th className="px-6 py-3 font-medium">Vai trò</th>
                <th className="px-6 py-3 font-medium">Trạng thái</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {!loading &&
                users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 font-medium text-ink-soft">{u.name}</td>
                    <td className="px-6 py-3 text-muted">{u.email}</td>
                    <td className="px-6 py-3 text-muted">{u.team ?? "—"}</td>
                    <td className="px-6 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value as Role)}
                        className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide outline-none ${
                          {
                            ink: "bg-ink text-white",
                            blue: "bg-pale-blue text-pale-blue-ink",
                            green: "bg-pale-green text-pale-green-ink",
                            yellow: "bg-pale-yellow text-pale-yellow-ink",
                          }[roleTone[u.role]]
                        }`}
                      >
                        {(Object.keys(roleLabels) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {roleLabels[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <select
                        value={u.status}
                        onChange={(e) =>
                          updateStatus(u.id, e.target.value as AppUser["status"])
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-ink"
                      >
                        {(Object.keys(statusLabel) as AppUser["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {statusLabel[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => setResetFor(u)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                      >
                        <Key size={14} />
                        Đặt lại MK
                      </button>
                    </td>
                  </tr>
                ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">
                    Đang tải...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <Modal title="Thêm người dùng" onClose={() => setShowInvite(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Họ tên
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Email công ty
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ten@tienthanhgroup.vn"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Team
              </span>
              <input
                value={form.team}
                onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
                placeholder="VD: Kinh doanh Miền Nam"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
            <Select
              label="Vai trò"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              {(Object.keys(roleLabels) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Mật khẩu ban đầu (≥ 8 ký tự)
              </span>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Báo mật khẩu này cho nhân viên qua Zalo/gặp trực tiếp"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </label>
            {inviteError && <p className="text-xs text-pale-red-ink">{inviteError}</p>}
            <button
              onClick={invite}
              className="mt-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98]"
            >
              Tạo tài khoản
            </button>
          </div>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Đặt lại mật khẩu — ${resetFor.name}`} onClose={closeReset}>
          {resetDone ? (
            <p className="text-sm text-pale-green-ink">
              Đã đặt lại mật khẩu. Báo mật khẩu mới cho nhân viên qua Zalo/gặp trực tiếp.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Mật khẩu mới (≥ 8 ký tự)
                </span>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              {resetError && <p className="text-xs text-pale-red-ink">{resetError}</p>}
              <button
                onClick={submitReset}
                className="mt-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98]"
              >
                Đặt lại mật khẩu
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
