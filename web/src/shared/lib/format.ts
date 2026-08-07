// Display formatting helpers, ported from app.js. Kept separate from
// date.ts (pure date-key math) because these are locale/presentation
// concerns rather than storage-key concerns.
import { DAY_MS, parseDateKey } from "./date";

export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTHS_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// Monday-first, matches the week strip
export const WEEKDAY_LETTERS_MON = ["L", "M", "X", "J", "V", "S", "D"];

export interface DateLabel {
  weekday: string;
  day: number;
  month: string;
  short: string;
}

export function formatDateLabel(offset: number): DateLabel {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const weekday = WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  return {
    weekday,
    day,
    month,
    short: offset === 0 ? "Hoy" : offset === -1 ? "Ayer" : offset === 1 ? "Mañana" : `${day} ${month}`
  };
}

export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Capitalizes the first letter — used for the "Martes, 5 de ago" card date,
// which reads better sentence-cased than the raw lowercase weekday array.
export function capitalizeFirst(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

// "ayer", "hace 3 d", "hace 2 sem" — a rough sense of how stale a
// previous performance is, which is all you need when picking what to do
// next. Falls back to the date once "weeks ago" stops being useful.
export function relativeDayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round(
    (parseDateKey(todayStr).getTime() - parseDateKey(dateStr).getTime()) / DAY_MS
  );
  if (diff <= 0) return "hoy";
  if (diff === 1) return "ayer";
  if (diff < 7) return `hace ${diff} d`;
  if (diff < 28) return `hace ${Math.floor(diff / 7)} sem`;
  return formatShortDate(dateStr);
}
