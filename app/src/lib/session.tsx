import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Role } from "./types";
import { authApi, ApiError, type MeResponse } from "./api";
import { clearQueryCache } from "./queryCache";

interface SessionState {
  isAuthenticated: boolean;
  isLoading: boolean;
  currentUser: MeResponse | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Tải lại thông tin người dùng (sau khi xác minh email, đổi tuỳ chọn thông báo...). */
  refreshUser: () => Promise<void>;
  setCurrentUser: (user: MeResponse) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  manager: "Quản lý",
  sales: "Nhân viên Sales",
  seo: "SEO/Content",
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      isAuthenticated: !!currentUser,
      isLoading,
      currentUser,
      login: async (email, password) => {
        await authApi.login(email, password);
        // Dữ liệu cache được lọc theo quyền người dùng trước - không dùng lại cho tài khoản mới.
        clearQueryCache();
        // /auth/me trả đủ trạng thái xác minh email + tuỳ chọn thông báo.
        setCurrentUser(await authApi.me());
      },
      refreshUser: async () => {
        setCurrentUser(await authApi.me().catch(() => null));
      },
      setCurrentUser,
      logout: async () => {
        await authApi.logout().catch(() => {});
        clearQueryCache();
        setCurrentUser(null);
      },
    }),
    [currentUser, isLoading],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export { ApiError };
