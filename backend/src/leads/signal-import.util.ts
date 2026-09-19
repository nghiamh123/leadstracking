import { randomBytes } from 'crypto';
import { LeadChannel } from '../generated/prisma/enums.js';

/**
 * File "TÍN HIỆU ONLINE" của đội sales gộp tín hiệu của nhiều website vào 1
 * bảng theo dõi dùng chung - cột "Nguồn" phân biệt tín hiệu đó thuộc website
 * nào (không phải tên kênh tiếp nhận, cột đó là "Kênh").
 */
export const SOURCE_WEBSITE_DOMAIN: Record<string, string> = {
  sxgs: 'sanxuatgomsu.vn',
  sxtt: 'sanxuatlythuytinh.vn',
  'quà tặng': 'quatangsg.vn',
};

const CHANNEL_MAP: Record<string, LeadChannel> = {
  zalo: LeadChannel.zalo,
  website: LeadChannel.form_web,
  facebook: LeadChannel.fanpage,
  'gọi hotline': LeadChannel.hotline,
  hotline: LeadChannel.hotline,
  chat: LeadChannel.chat,
};

function normalizeKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function resolveWebsiteDomain(nguon: string | undefined): string | undefined {
  return SOURCE_WEBSITE_DOMAIN[normalizeKey(nguon)];
}

export function resolveChannel(kenh: string | undefined): LeadChannel | undefined {
  return CHANNEL_MAP[normalizeKey(kenh)];
}

/** "Ngày" trong file chỉ có dạng DD.MM hoặc DD/MM, không có năm. */
export function parseSignalDate(raw: string | undefined, year: number): string | undefined {
  const match = (raw ?? '').trim().match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (!match) return undefined;
  const dayNum = Number(match[1]);
  const monthNum = Number(match[2]);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return undefined;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Chuẩn hoá SĐT dạng "0927 124 862", "84336341497" về "0xxxxxxxxxx". Trả về "" nếu không có/không hợp lệ. */
export function normalizePhone(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) return '0' + digits.slice(2);
  if (digits.startsWith('0')) return digits;
  return '';
}

/** "4.402.778" (dấu chấm phân cách nghìn) -> 4402778. */
export function parseVnCurrency(raw: string | undefined): number {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export type SignalOutcome = 'won' | 'rejected' | 'in_progress';

export function classifySignalStatus(raw: string | undefined): SignalOutcome {
  const text = (raw ?? '').toLowerCase();
  if (text.includes('chốt đơn')) return 'won';
  if (text.includes('từ chối')) return 'rejected';
  return 'in_progress';
}

export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function generateTempPassword(): string {
  return randomBytes(6).toString('base64url');
}

export interface SignalRow {
  ngay?: string;
  nguon?: string;
  kenh?: string;
  phanLoaiKh?: string;
  tenKhachHang?: string;
  tenCongTy?: string;
  dienThoai?: string;
  sanPham?: string;
  soLuong?: string;
  xuLy?: string;
  tinhTrangTinHieu?: string;
  doanhSoChotDon?: string;
  kdPhuTrach?: string;
}

/** Map các bản ghi CSV (header đã parse thành key) sang SignalRow, bỏ qua dòng header lặp lại. */
export function mapSignalRecords(records: Record<string, string>[]): SignalRow[] {
  return records
    .filter((r) => (r['Ngày'] ?? '').trim() && r['Ngày'].trim() !== 'Ngày')
    .map((r) => ({
      ngay: r['Ngày'],
      nguon: r['Nguồn'],
      kenh: r['Kênh'],
      phanLoaiKh: r['Phân loại KH'],
      tenKhachHang: r['Tên Khách hàng'],
      tenCongTy: r['Tên Công ty'],
      dienThoai: r['Điện thoại'],
      sanPham: r['Sản phẩm'],
      soLuong: r['Số lượng'],
      xuLy: r['Xử lý'],
      tinhTrangTinHieu: r['Tình trạng tín hiệu'],
      doanhSoChotDon: r['Doanh số chốt đơn'],
      kdPhuTrach: r['KD Phụ trách'],
    }));
}

/** Tải CSV từ link "Publish to web" của Google Sheet (giống cơ chế đồng bộ GSC). */
export async function fetchSignalCsvText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Không tải được link CSV (HTTP ${res.status}). Kiểm tra link "Publish to web" còn hiệu lực không.`);
  }
  return res.text();
}
