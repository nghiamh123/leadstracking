export function formatNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(n: number, digits = 1): string {
  if (!isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tách chuỗi liên hệ thành danh sách SĐT 10 số. Một khách có thể để lại 2 số
 * dính liền nhau (vd "03825170810826350017"), nên gom hết chữ số rồi cắt mỗi 10 số.
 * "+84"/"84" đầu số được đổi về "0". Không có chữ số nào thì trả nguyên chuỗi.
 */
export function splitPhones(contact: string): string[] {
  const digits = contact.replace(/(^|[^\d])\+?84(?=\d{9}(?!\d))/g, "$10").replace(/\D/g, "");
  if (!digits) return contact.trim() ? [contact.trim()] : [];
  return digits.match(/\d{1,10}/g) ?? [];
}
