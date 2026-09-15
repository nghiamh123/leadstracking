export type RangePreset = "today" | "7d" | "30d" | "custom";

export const rangePresetLabels: Record<RangePreset, string> = {
  today: "Hôm nay",
  "7d": "7 ngày qua",
  "30d": "30 ngày qua",
  custom: "Tùy chọn",
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function resolveRange(
  preset: RangePreset,
  custom?: { start: string; end: string },
): { start: string; end: string; days: number } {
  const today = new Date();
  if (preset === "custom" && custom?.start && custom?.end) {
    const days =
      Math.round(
        (new Date(custom.end).getTime() - new Date(custom.start).getTime()) /
          86_400_000,
      ) + 1;
    return { ...custom, days: Math.max(days, 1) };
  }
  const days = preset === "today" ? 1 : preset === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { start: toISODate(start), end: toISODate(today), days };
}

export function previousRange(start: string, days: number) {
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start: toISODate(prevStart), end: toISODate(prevEnd) };
}

export function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}
