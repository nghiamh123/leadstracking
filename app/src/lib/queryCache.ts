import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Cache dữ liệu API dùng chung cho cả app (stale-while-revalidate):
 * - Quay lại một trang đã xem: hiện ngay dữ liệu đã cache, đồng thời tải lại ngầm.
 * - Nhiều component cùng cần một key (vd danh sách website) chỉ gửi 1 request.
 * Cache nằm trong bộ nhớ, mất khi tải lại trang; đăng nhập/đăng xuất phải gọi clearQueryCache()
 * vì dữ liệu Lead/Đơn hàng được lọc theo quyền của từng người dùng.
 */
interface Entry {
  data?: unknown;
  error?: unknown;
  promise?: Promise<unknown>;
  updatedAt: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
// Tăng mỗi lần clearQueryCache để kết quả của request cũ (của người dùng trước) không ghi vào cache mới.
let generation = 0;

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/** Tải key (gộp với request đang chạy cho cùng key nếu có) và cập nhật cache. */
export function fetchQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const e = cache.get(key) ?? { updatedAt: 0 };
  if (e.promise) return e.promise as Promise<T>;
  const gen = generation;
  const promise = fetcher().then(
    (data) => {
      if (gen === generation) {
        cache.set(key, { data, updatedAt: Date.now() });
        notify(key);
      }
      return data;
    },
    (error: unknown) => {
      if (gen === generation) {
        cache.set(key, { data: cache.get(key)?.data, error, updatedAt: Date.now() });
        notify(key);
      }
      throw error;
    },
  );
  // Luôn thay object mới (không sửa tại chỗ) để useSyncExternalStore thấy snapshot đổi.
  cache.set(key, { ...e, promise });
  notify(key);
  return promise;
}

/** Tải trước (vd ngay khi vào app) - lỗi bỏ qua, trang dùng key đó sẽ tự tải lại. */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>, staleMs = 0) {
  const e = cache.get(key);
  if (e && (e.promise || (e.data !== undefined && Date.now() - e.updatedAt < staleMs))) return;
  fetchQuery(key, fetcher).catch(() => {});
}

/** Đánh dấu cũ các key bắt đầu bằng prefix: lần mount sau sẽ tải lại (vẫn hiện dữ liệu cũ trong lúc chờ). */
export function invalidateQueries(prefix: string) {
  for (const [key, e] of cache) if (key.startsWith(prefix)) cache.set(key, { ...e, updatedAt: 0 });
}

export function clearQueryCache() {
  generation++;
  const keys = [...cache.keys()];
  cache.clear();
  keys.forEach(notify);
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

export interface QueryResult<T> {
  data: T | undefined;
  /** true khi chưa có dữ liệu nào cho key hiện tại (lần đầu xem bộ lọc/trang này). */
  loading: boolean;
  /** Đang tải lại ngầm trong khi vẫn hiện dữ liệu cache. */
  refreshing: boolean;
  error: unknown;
  /** Tải lại ngay (sau khi thêm/sửa/xoá), trả về promise để chờ xong. */
  reload: () => Promise<T | undefined>;
}

/**
 * Đọc dữ liệu theo key. `key = null` để bỏ qua (vd chưa đủ điều kiện gọi API).
 * Mỗi lần mount/đổi key: nếu dữ liệu cache cũ hơn `staleMs` thì tải lại ngầm.
 * `fetcher` chỉ được gọi theo key, nên mọi tham số của nó phải nằm trong key.
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { staleMs?: number } = {},
): QueryResult<T> {
  const staleMs = options.staleMs ?? 0;

  const snapshot = useSyncExternalStore(
    useCallback((fn: () => void) => (key ? subscribe(key, fn) : () => {}), [key]),
    () => (key ? cache.get(key) : undefined),
  );

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    if (e?.promise) return;
    if (e?.data !== undefined && Date.now() - e.updatedAt < staleMs) return;
    fetchQuery(key, fetcher).catch(() => {});
    // fetcher đổi theo mỗi render nhưng tham số đã nằm trong key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, staleMs]);

  const reload = useCallback(
    () => (key ? fetchQuery(key, fetcher).catch(() => undefined) : Promise.resolve(undefined)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const data = snapshot?.data as T | undefined;
  return {
    data,
    loading: !!key && data === undefined && snapshot?.error === undefined,
    refreshing: !!snapshot?.promise,
    error: snapshot?.error,
    reload,
  };
}
