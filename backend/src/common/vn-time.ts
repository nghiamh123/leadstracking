/** Giờ Việt Nam (UTC+7, không có giờ mùa hè) - dùng cho "hôm nay", hạn nhắc việc... */

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Ngày YYYY-MM-DD theo giờ Việt Nam. */
export function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Giờ HH:mm theo giờ Việt Nam. */
export function vnTime(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);
}

/** 00:00 hôm nay theo giờ Việt Nam, trả về dạng Date (UTC). */
export function startOfTodayVn(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  vn.setUTCHours(0, 0, 0, 0);
  return new Date(vn.getTime() - VN_OFFSET_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** "2026-09-25" + "14:30" (giờ VN) → Date. Không có giờ thì lấy 09:00. */
export function fromVnDateTime(date: string, time = '09:00'): Date {
  return new Date(`${date}T${time}:00+07:00`);
}
