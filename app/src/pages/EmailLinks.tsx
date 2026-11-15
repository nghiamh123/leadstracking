import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, EnvelopeSimple, Warning } from "@phosphor-icons/react";
import { authApi, ApiError } from "../lib/api";
import { useSession } from "../lib/session";

const input =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink";
const primaryBtn =
  "mt-2 flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-60";

/** Khung chung cho các trang mở từ link trong email (không cần đăng nhập) - cùng kiểu trang Đăng nhập. */
function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand opacity-[0.12] blur-3xl"
      />
      <div className="fade-up relative w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <img src="/brand/logo-sangtaoviet.png" alt="Sáng Tạo Việt" className="mx-auto mb-4 h-16 w-auto" />
        <h1 className="mb-6 text-center font-serif text-2xl tracking-tight text-ink">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-pale-red-ink">
      <Warning size={14} className="shrink-0" />
      {message}
    </p>
  );
}

function BackToLogin({ label = "Quay lại đăng nhập" }: { label?: string }) {
  return (
    <Link to="/" className="mt-6 block text-center text-xs font-medium text-ink-soft hover:text-ink">
      {label}
    </Link>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được yêu cầu, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Quên mật khẩu">
      {sent ? (
        <p className="text-sm text-ink-soft">
          Nếu <strong>{email}</strong> có tài khoản, hệ thống đã gửi link đặt lại mật khẩu (hiệu lực 1 giờ). Hãy mở hộp
          thư, kể cả mục Spam.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-sm text-muted">Nhập email đăng nhập, hệ thống sẽ gửi link để bạn đặt mật khẩu mới.</p>
          <input
            type="email"
            required
            autoFocus
            placeholder="ten@congty.vn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          {error && <ErrorLine message={error} />}
          <button type="submit" disabled={submitting} className={primaryBtn}>
            <EnvelopeSimple size={16} />
            {submitting ? "Đang gửi..." : "Gửi link đặt lại"}
          </button>
        </form>
      )}
      <BackToLogin />
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Mật khẩu mới phải có ít nhất 8 ký tự");
    if (password !== confirm) return setError("Nhập lại mật khẩu không khớp");
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đặt lại được mật khẩu, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <ErrorLine message="Link không hợp lệ. Hãy mở đúng link trong email." />
        <BackToLogin label="Yêu cầu link mới" />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đặt lại mật khẩu">
      {done ? (
        <>
          <p className="flex items-center gap-2 text-sm text-pale-green-ink">
            <CheckCircle size={18} />
            Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.
          </p>
          <BackToLogin label="Đăng nhập" />
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
          />
          {error && <ErrorLine message={error} />}
          <button type="submit" disabled={submitting} className={primaryBtn}>
            {submitting ? "Đang lưu..." : "Đặt mật khẩu mới"}
          </button>
          {error && (
            <Link to="/forgot-password" className="text-center text-xs font-medium text-ink-soft hover:text-ink">
              Yêu cầu link mới
            </Link>
          )}
        </form>
      )}
    </AuthCard>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { isAuthenticated, refreshUser } = useSession();
  const [state, setState] = useState<"loading" | "done" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "Link không hợp lệ. Hãy mở đúng link trong email.");
  const started = useRef(false);

  useEffect(() => {
    // Token dùng 1 lần - chặn StrictMode gọi effect 2 lần làm lần sau báo "đã hết hạn".
    if (!token || started.current) return;
    started.current = true;
    authApi
      .confirmEmail(token)
      .then((res) => {
        setMessage(`Đã xác minh ${res.email}. Từ giờ bạn sẽ nhận được email thông báo từ hệ thống.`);
        setState("done");
        return refreshUser();
      })
      .catch((err) => {
        setMessage(err instanceof ApiError ? err.message : "Không xác minh được, thử lại sau.");
        setState("error");
      });
  }, [token, refreshUser]);

  return (
    <AuthCard title="Xác minh email">
      {state === "loading" && <p className="text-center text-sm text-muted">Đang xác minh...</p>}
      {state === "done" && (
        <p className="flex items-start gap-2 text-sm text-pale-green-ink">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
      {state === "error" && <ErrorLine message={message} />}
      {isAuthenticated ? (
        <Link to="/account" className="mt-6 block text-center text-xs font-medium text-ink-soft hover:text-ink">
          Mở trang Tài khoản
        </Link>
      ) : (
        <BackToLogin label="Đăng nhập" />
      )}
    </AuthCard>
  );
}
