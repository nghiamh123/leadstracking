/**
 * So sánh dữ liệu cũ/mới để ghi lịch sử thay đổi (audit log) khi sửa Lead/Đơn hàng.
 *
 * Trước đây so sánh bằng String(): cột ngày (@db.Date) là Date nên ra "Fri Aug 14 2026 ...",
 * còn form gửi "2026-08-14" -> lần sửa nào cũng ghi thêm dòng "date" dù ngày không đổi.
 * Tương tự ghi chú null trong DB và "" từ form bị coi là khác nhau.
 */

/** Giá trị dạng chuỗi để so sánh và lưu vào audit log: ngày -> YYYY-MM-DD, null/undefined -> "". */
export function auditValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Giá trị mới quy về cùng dạng với giá trị cũ (chuỗi ngày/giờ ISO so với cột ngày -> YYYY-MM-DD). */
function normalizeNew(next: unknown, previous: unknown): string {
  if (previous instanceof Date && typeof next === 'string') {
    const parsed = new Date(next);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return auditValue(next);
}

export interface AuditChange {
  field: string;
  oldValue: string;
  newValue: string;
}

/** Các trường trong dto thật sự đổi giá trị so với bản ghi hiện tại (bỏ qua trường không gửi). */
export function auditChanges(dto: object, existing: object): AuditChange[] {
  const next = dto as Record<string, unknown>;
  const previous = existing as Record<string, unknown>;
  return Object.keys(next)
    .filter((field) => next[field] !== undefined)
    .map((field) => ({
      field,
      oldValue: auditValue(previous[field]),
      newValue: normalizeNew(next[field], previous[field]),
    }))
    .filter((change) => change.oldValue !== change.newValue);
}
