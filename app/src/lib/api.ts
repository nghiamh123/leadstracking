import type {
  AppUser,
  Keyword,
  Lead,
  LeadChannel,
  LeadStatus,
  Order,
  OrderStatus,
  AuditLogEntry,
  Role,
  SyncLogEntry,
  Website,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      // Bỏ qua trang cảnh báo của ngrok free tier khi API chạy qua tunnel -
      // không ảnh hưởng gì khi gọi thẳng localhost (backend chỉ đọc nếu có).
      "ngrok-skip-browser-warning": "true",
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? message);
    } catch {
      // response body wasn't JSON - keep statusText
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

// ---- Auth ----
export interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: string | null;
  status: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<MeResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => apiFetch<MeResponse>("/auth/me"),
  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: true }>("/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ---- Websites ----
export const websitesApi = {
  list: () => apiFetch<Website[]>("/websites"),
  create: (data: {
    name: string;
    domain: string;
    gscProperty: string;
    trafficCsvUrl?: string;
    keywordsCsvUrl?: string;
  }) => apiFetch<Website>("/websites", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<{
      name: string;
      domain: string;
      gscProperty: string;
      trafficCsvUrl: string;
      keywordsCsvUrl: string;
    }>,
  ) => apiFetch<Website>(`/websites/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reconnect: (id: string) => apiFetch<Website>(`/websites/${id}/reconnect`, { method: "POST" }),
  uploadGscData: (
    id: string,
    files: { traffic?: File; keywords?: File },
    range?: { start?: string; end?: string },
  ) => {
    const form = new FormData();
    if (files.traffic) form.append("traffic", files.traffic);
    if (files.keywords) form.append("keywords", files.keywords);
    return apiFetch<{
      traffic?: { ok: boolean; rows: number };
      keywords?: { ok: boolean; rows: number };
    }>(`/websites/${id}/gsc-upload${qs({ rangeStart: range?.start, rangeEnd: range?.end })}`, {
      method: "POST",
      body: form,
    });
  },
};

// ---- Users ----
export const usersApi = {
  list: () => apiFetch<AppUser[]>("/users"),
  invite: (data: { name: string; email: string; role: Role; team?: string; password: string }) =>
    apiFetch<AppUser>("/users/invite", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, role: Role) =>
    apiFetch<AppUser>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  updateStatus: (id: string, status: AppUser["status"]) =>
    apiFetch<AppUser>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resetPassword: (id: string, newPassword: string) =>
    apiFetch<{ ok: true }>(`/users/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword }),
    }),
};

// ---- Dashboard ----
export interface DashboardSummary {
  clicks: number;
  leadCount: number;
  orderCount: number;
}
export interface TrendPoint {
  date: string;
  clicks: number;
  leads: number;
  orders: number;
}
export interface WebsiteFunnelRow {
  websiteId: string;
  websiteName: string;
  clicks: number;
  leadCount: number;
  orderCount: number;
  leadRate: number;
  orderRate: number;
  totalRate: number;
}

export interface WebsiteTrendPoint {
  date: string;
  [websiteId: string]: string | number;
}
export interface WebsiteTrendResponse {
  websites: { id: string; name: string }[];
  data: WebsiteTrendPoint[];
}

export const dashboardApi = {
  summary: (params: { start: string; end: string; websiteId?: string; salesRepId?: string }) =>
    apiFetch<DashboardSummary>(`/dashboard/summary${qs(params)}`),
  trend: (params: { start: string; end: string; websiteId?: string; salesRepId?: string }) =>
    apiFetch<TrendPoint[]>(`/dashboard/trend${qs(params)}`),
  trendByWebsite: (params: { start: string; end: string }) =>
    apiFetch<WebsiteTrendResponse>(`/dashboard/trend-by-website${qs(params)}`),
  byWebsite: (params: { start: string; end: string; salesRepId?: string }) =>
    apiFetch<WebsiteFunnelRow[]>(`/dashboard/by-website${qs(params)}`),
  exportUrl: (params: { start: string; end: string; salesRepId?: string }) =>
    `${API_BASE}/dashboard/export.csv${qs(params)}`,
};

// ---- Keywords ----
export interface KeywordsPage {
  data: Keyword[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const keywordsApi = {
  list: (params: {
    websiteId?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  }) =>
    apiFetch<KeywordsPage>(
      `/keywords${qs({
        websiteId: params.websiteId,
        search: params.search,
        sortBy: params.sortBy,
        sortDir: params.sortDir,
        page: params.page?.toString(),
        pageSize: params.pageSize?.toString(),
      })}`,
    ),
};

// ---- Leads ----
export interface LeadsPage {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const leadsApi = {
  /** Không phân trang - dùng cho dropdown/tra cứu (vd liên kết Lead ở trang Đơn hàng). */
  list: (params: { websiteId?: string; status?: LeadStatus; salesRepId?: string; search?: string }) =>
    apiFetch<Lead[]>(`/leads${qs(params)}`),
  listPaged: (params: {
    websiteId?: string;
    status?: LeadStatus;
    salesRepId?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) =>
    apiFetch<LeadsPage>(
      `/leads${qs({ ...params, page: String(params.page), pageSize: String(params.pageSize) })}`,
    ),
  create: (data: Omit<Lead, "id">) =>
    apiFetch<Lead>("/leads", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Lead, "id">>) =>
    apiFetch<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/leads/${id}`, { method: "DELETE" }),
  history: (id: string) => apiFetch<AuditLogEntry[]>(`/leads/${id}/history`),
  templateUrl: () => `${API_BASE}/leads/template.csv`,
  import: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ success: number; failed: number; errors: string[] }>("/leads/import", {
      method: "POST",
      body: form,
    });
  },
  importSignal: async (file: File, year: number) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<SignalImportResult>(`/leads/import-signal${qs({ year: String(year) })}`, {
      method: "POST",
      body: form,
    });
  },
  importSignalUrl: (url: string, year: number) =>
    apiFetch<SignalImportResult>("/leads/import-signal-url", {
      method: "POST",
      body: JSON.stringify({ url, year }),
    }),
};

export interface SignalImportResult {
  success: number;
  ordersCreated: number;
  failed: number;
  errors: string[];
  newSalesAccounts: { name: string; email: string; tempPassword: string }[];
}

// ---- Orders ----
export interface OrdersPage {
  data: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Tổng giá trị của toàn bộ tập đã lọc (không tính đơn đã huỷ), không chỉ trang hiện tại. */
  totalValue: number;
}

export const ordersApi = {
  list: (params: { websiteId?: string; status?: OrderStatus; salesRepId?: string }) =>
    apiFetch<Order[]>(`/orders${qs(params)}`),
  listPaged: (params: {
    websiteId?: string;
    status?: OrderStatus;
    salesRepId?: string;
    page: number;
    pageSize: number;
  }) =>
    apiFetch<OrdersPage>(
      `/orders${qs({ ...params, page: String(params.page), pageSize: String(params.pageSize) })}`,
    ),
  create: (data: Omit<Order, "id">) =>
    apiFetch<Order>("/orders", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Order, "id">>) =>
    apiFetch<Order>(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<{ ok: true }>(`/orders/${id}`, { method: "DELETE" }),
  templateUrl: () => `${API_BASE}/orders/template.csv`,
  import: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ success: number; failed: number; errors: string[] }>("/orders/import", {
      method: "POST",
      body: form,
    });
  },
};

// ---- Sync logs ----
export interface SyncLogsPage {
  data: SyncLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const syncLogsApi = {
  list: (params: { websiteId?: string; status?: string; page: number; pageSize: number }) =>
    apiFetch<SyncLogsPage>(
      `/sync-logs${qs({ ...params, page: String(params.page), pageSize: String(params.pageSize) })}`,
    ),
  rerun: (id: string) => apiFetch<unknown>(`/sync-logs/${id}/rerun`, { method: "POST" }),
  syncNow: (websiteId: string) =>
    apiFetch<unknown>("/sync-logs/sync", { method: "POST", body: JSON.stringify({ websiteId }) }),
};

export type { LeadChannel };
