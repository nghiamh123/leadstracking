import { useCallback, useEffect, useState } from "react";
import { usersApi, websitesApi } from "./api";
import { prefetchQuery, useQuery } from "./queryCache";
import { useSession } from "./session";
import type { AppUser, Role, Website } from "./types";

// Danh sách website/người dùng ít đổi và trang nào cũng cần: dùng chung một bản cache,
// coi là mới trong 5 phút (trang quản trị gọi reload() sau khi sửa nên vẫn thấy ngay).
const SHARED_STALE_MS = 5 * 60 * 1000;
const EMPTY_WEBSITES: Website[] = [];
const EMPTY_USERS: AppUser[] = [];

export const WEBSITES_KEY = "websites";
export const USERS_KEY = "users";

export function useWebsites() {
  const { data, loading, reload } = useQuery(WEBSITES_KEY, websitesApi.list, {
    staleMs: SHARED_STALE_MS,
  });
  return { websites: data ?? EMPTY_WEBSITES, loading, reload };
}

/** /users chỉ dành cho admin - role khác không gọi (trước đây luôn nhận 403). */
export function useUsers() {
  const { currentUser } = useSession();
  const { data, loading, reload } = useQuery(
    currentUser?.role === "admin" ? USERS_KEY : null,
    usersApi.list,
    { staleMs: SHARED_STALE_MS },
  );
  return { users: data ?? EMPTY_USERS, loading, reload };
}

/** Gọi khi vào app để trang đầu tiên không phải chờ thêm một lượt request. */
export function prefetchSharedData(role: Role) {
  prefetchQuery(WEBSITES_KEY, websitesApi.list, SHARED_STALE_MS);
  if (role === "admin") prefetchQuery(USERS_KEY, usersApi.list, SHARED_STALE_MS);
}

/**
 * Giá trị trễ `ms` sau lần đổi cuối (dùng cho ô tìm kiếm). Giá trị ban đầu có ngay - không bắt
 * mỗi lần mở trang phải chờ thêm `ms` như khi debounce cả lần tải đầu.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Số trang hiện tại, tự về trang 1 khi `resetKey` (bộ lọc/số dòng mỗi trang) đổi - ngay trong lần
 * render đó, không qua effect, nên không gửi thừa request cho tổ hợp "bộ lọc mới + trang cũ".
 */
export function usePageState(resetKey: string) {
  const [state, setState] = useState({ resetKey, page: 1 });
  const page = state.resetKey === resetKey ? state.page : 1;
  const setPage = useCallback((next: number) => setState({ resetKey, page: next }), [resetKey]);
  return [page, setPage] as const;
}
