import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useSession } from "../../lib/session";
import { authApi, ApiError } from "../../lib/api";

/** Nhắc xác minh email (chưa xác minh = không nhận được email thông báo). Ẩn trên trang Tài khoản vì ở đó đã có. */
export function VerifyEmailBanner() {
  const { currentUser } = useSession();
  const { pathname } = useLocation();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!currentUser || currentUser.emailVerifiedAt || pathname === "/account") return null;

  async function send() {
    setState("sending");
    setError(null);
    try {
      await authApi.sendVerification();
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? err.message : "Không gửi được email, thử lại sau.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-pale-yellow px-4 py-2 text-xs text-pale-yellow-ink sm:px-6">
      <EnvelopeSimple size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {state === "sent"
          ? `Đã gửi link xác minh tới ${currentUser.email} - mở hộp thư (cả mục Spam) và bấm vào link.`
          : `Email ${currentUser.email} chưa được xác minh nên bạn chưa nhận được email thông báo.`}
        {error && <span className="ml-1 text-pale-red-ink">{error}</span>}
      </span>
      {state !== "sent" && (
        <button
          onClick={send}
          disabled={state === "sending"}
          className="font-medium underline underline-offset-2 hover:text-ink disabled:opacity-60"
        >
          {state === "sending" ? "Đang gửi..." : "Gửi email xác minh"}
        </button>
      )}
      <Link to="/account" className="font-medium hover:text-ink">
        Cài đặt thông báo
      </Link>
    </div>
  );
}
