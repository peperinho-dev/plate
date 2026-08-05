// Local-calendar-day helpers, ported verbatim from app.js. Deliberately
// never use toISOString() for date keys — it renders in UTC, which shifts
// the "day" by however many hours the local timezone is offset, right
// around local midnight.

export const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatDateKey(d);
}

// Rebases a timestamp's time-of-day onto a different calendar day, so a
// pasted entry lands at the same hour it was originally logged at instead
// of bunching everything at the moment of pasting.
export function rebaseTimeToDay(sourceTs: number, targetDayKey: string): number {
  const src = new Date(sourceTs);
  const [y, m, d] = targetDayKey.split("-").map(Number);
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds()).getTime();
}

// Days between today and an arbitrary date, as an offset usable with
// todayKey()/dayOffset.
export function dateOffsetFromToday(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}
