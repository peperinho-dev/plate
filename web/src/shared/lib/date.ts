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
