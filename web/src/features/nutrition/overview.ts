// Data behind the Nutrition Overview.
//
// Reached by tapping the day's totals, and answering the question the
// totals can't: not "what did I eat today" but "what does my intake
// actually look like" — over a day, a week, a quarter — and which foods
// are driving each number.
import type { AppState, Entry } from "../../shared/store/types";
import { formatDateKey, parseDateKey } from "../../shared/lib/date";
import { RANGE_LABELS } from "../../shared/lib/chart";

export type PeriodId = "day" | "week" | "month" | "quarter" | "year";

// Labels come from the shared table so a window cannot be called "1 mes"
// here and "30 d" on a chart. The option set is this screen's own: an
// overview of a single day is a real question, a one-day trend is not.
export const OVERVIEW_PERIODS: { id: PeriodId; label: string; days: number }[] = [
  { id: "day", label: RANGE_LABELS[1], days: 1 },
  { id: "week", label: RANGE_LABELS[7], days: 7 },
  { id: "month", label: RANGE_LABELS[30], days: 30 },
  { id: "quarter", label: RANGE_LABELS[90], days: 90 },
  { id: "year", label: RANGE_LABELS[365], days: 365 }
];

/** The `count` days ending at (and including) `endDayKey`. */
export function periodKeys(endDayKey: string, count: number): string[] {
  const end = parseDateKey(endDayKey);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

export type NutrientId = "calories" | "protein" | "fat" | "carbs" | "fiber" | "sugar" | "sodium";

export const NUTRIENT_PICKERS: Record<NutrientId, (e: Entry) => number> = {
  calories: (e) => e.calories || 0,
  protein: (e) => e.protein || 0,
  fat: (e) => e.fat || 0,
  carbs: (e) => e.carbs || 0,
  fiber: (e) => e.fiber || 0,
  sugar: (e) => e.sugar || 0,
  sodium: (e) => e.sodium || 0
};

export interface Contributor {
  name: string;
  amount: number;
  /** Share of the period's total for this nutrient, 0..100. */
  share: number;
}

export interface NutrientReading {
  id: NutrientId;
  /** Total for a single day, or the daily average across a longer period. */
  value: number;
  contributors: Contributor[];
}

export interface OverviewReading {
  /** Days in the window that actually have food logged. */
  loggedDays: number;
  windowDays: number;
  averaged: boolean;
  nutrients: Record<NutrientId, NutrientReading>;
}

export function readOverview(
  days: AppState["days"],
  endDayKey: string,
  periodDays: number
): OverviewReading {
  const keys = periodKeys(endDayKey, periodDays);
  const entries: Entry[] = [];
  let loggedDays = 0;
  for (const k of keys) {
    const dayEntries = days[k]?.entries ?? [];
    if (dayEntries.length > 0) loggedDays += 1;
    entries.push(...dayEntries);
  }

  // Averaged over days that were actually logged, never over the calendar.
  // A month with four logged days is a report about four days; dividing by
  // thirty would invent twenty-six days of fasting.
  const divisor = periodDays === 1 ? 1 : Math.max(1, loggedDays);
  const averaged = periodDays > 1;

  const nutrients = {} as Record<NutrientId, NutrientReading>;
  (Object.keys(NUTRIENT_PICKERS) as NutrientId[]).forEach((id) => {
    const pick = NUTRIENT_PICKERS[id];
    const total = entries.reduce((sum, e) => sum + pick(e), 0);

    const tally = new Map<string, { name: string; amount: number }>();
    entries.forEach((e) => {
      const amount = pick(e);
      if (amount <= 0) return;
      const key = e.name.trim().toLowerCase();
      if (!key) return;
      const found = tally.get(key);
      if (found) found.amount += amount;
      else tally.set(key, { name: e.name, amount });
    });

    const contributors: Contributor[] = Array.from(tally.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((c) => ({
        name: c.name,
        amount: c.amount / divisor,
        share: total > 0 ? (c.amount / total) * 100 : 0
      }));

    nutrients[id] = { id, value: total / divisor, contributors };
  });

  return { loggedDays, windowDays: periodDays, averaged, nutrients };
}

export interface SeriesPoint {
  date: string;
  value: number;
  logged: boolean;
}

/**
 * Daily values for one nutrient, ending at `endDayKey`.
 *
 * The window is at least a fortnight — a trend drawn from one day is not a
 * trend — and capped at 90 days, past which daily bars stop being legible
 * on a phone. The caller shows the real window so a year-long selection
 * doesn't silently claim to be charting a year.
 */
export const TREND_MIN_DAYS = 14;
export const TREND_MAX_DAYS = 90;

export function trendWindow(periodDays: number): number {
  return Math.min(TREND_MAX_DAYS, Math.max(TREND_MIN_DAYS, periodDays));
}

export function nutrientSeries(
  days: AppState["days"],
  endDayKey: string,
  windowDays: number,
  nutrient: NutrientId
): SeriesPoint[] {
  const pick = NUTRIENT_PICKERS[nutrient];
  return periodKeys(endDayKey, windowDays).map((date) => {
    const entries = days[date]?.entries ?? [];
    return {
      date,
      value: entries.reduce((sum, e) => sum + pick(e), 0),
      logged: entries.length > 0
    };
  });
}
