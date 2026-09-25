export type Role = "admin" | "manager" | "sales" | "seo";

export interface Website {
  id: string;
  name: string;
  domain: string;
  gscProperty: string;
  status: "connected" | "error" | "pending";
  trafficCsvUrl?: string | null;
  keywordsCsvUrl?: string | null;
}

export interface HostingAccount {
  id: string;
  websiteId: string;
  label: string;
  loginUrl: string;
  username: string | null;
  note: string | null;
  /** Mật khẩu không bao giờ trả trong danh sách - xem qua hostingsApi.revealPassword. */
  hasPassword: boolean;
  website: { id: string; name: string; domain: string };
}

export interface Keyword {
  websiteId: string;
  websiteName: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  tag: "potential" | "strong" | null;
}

// Giá trị "wire" khớp enum backend (LeadChannel/LeadStatus/OrderStatus) -
// nhãn tiếng Việt hiển thị được map qua src/lib/enumMap.ts.
export type LeadChannel = "form_web" | "zalo" | "fanpage" | "hotline" | "chat";
export type LeadStatus = "moi" | "dang_cham_soc" | "da_chuyen_don" | "huy";
export type OrderStatus = "cho_xu_ly" | "da_giao" | "huy";

export interface Lead {
  id: string;
  date: string;
  websiteId: string;
  customerName: string;
  contact: string;
  channel: LeadChannel;
  interest: string;
  salesRepId: string;
  status: LeadStatus;
  note?: string | null;
}

export interface Order {
  id: string;
  date: string;
  leadId?: string | null;
  websiteId: string;
  value: number;
  product: string;
  salesRepId: string;
  status: OrderStatus;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: string | null;
  status: "active" | "invited" | "disabled";
}

export interface SyncLogEntry {
  id: string;
  runAt: string;
  websiteId: string;
  scope: "traffic" | "keywords";
  status: "success" | "failed" | "running";
  rows: number;
  message?: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: "create" | "update" | "delete";
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changedAt: string;
  changedBy: { name: string };
}
