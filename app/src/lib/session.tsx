import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Role } from "./types";
import { authApi, ApiError, type MeResponse } from "./api";

interface SessionState {
  isAuthenticated: boolean;
  isLoading: boolean;
  currentUser: MeResponse | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
        const user = await authApi.login(email, password);
        setCurrentUser(user);
      },
      logout: async () => {
        await authApi.logout().catch(() => {});
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
