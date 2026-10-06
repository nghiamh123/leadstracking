import { useState } from "react";
import { Navigate } from "react-router-dom";
import { LockKey, Warning } from "@phosphor-icons/react";
import { useSession, ApiError } from "../lib/session";

export function Login() {
  const { isAuthenticated, isLoading, login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể đăng nhập. Thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand opacity-[0.12] blur-3xl"
      />

      <div className="fade-up relative w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <div className="mb-8 text-center">
          <img
            src="/brand/logo-inogift.png"
            alt="Inogift Sài Gòn"
            className="mx-auto mb-4 h-20 w-auto"
          />
          <h1 className="font-serif text-2xl tracking-tight text-ink">
            Phễu Chuyển Đổi
          </h1>
          <p className="mt-1 text-sm text-muted">
            Inogift Sài Gòn — nội bộ, đo lường Traffic → Lead → Đơn hàng
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Email công ty
            </span>
            <input
              type="email"
              required
              placeholder="ten@inogiftsaigon.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Mật khẩu
            </span>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </label>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-pale-red-ink">
              <Warning size={14} />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <LockKey size={16} />
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted">
          Chỉ dành cho nhân viên Inogift Sài Gòn. Liên hệ quản trị viên nếu bạn
          chưa có tài khoản.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 border-t border-border pt-4 text-[11px] text-muted">
          <span>Phát triển bởi</span>
          <img
            src="/brand/logo-owner.png"
            alt="Đơn vị phát triển"
            className="h-6 w-auto"
          />
        </div>
      </div>
    </div>
  );
}
