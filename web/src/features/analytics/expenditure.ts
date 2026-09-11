// A rolling expenditure estimate, which is what makes MacroFactor's
// Expenditure widget possible.
//
// The method is the energy-balance identity, not a formula: over a window
// long enough for water weight to wash out, expenditure equals what you
// ate minus what you stored. A kilogram of body mass is treated as ~7700
// kcal, the conventional figure.
//
//   expenditure ≈ mean daily intake − (Δ trend weight × 7700) / days
//
// It needs the smoothed weight trend rather than raw weigh-ins: a single
// heavy morning at either end of the window would otherwise swing the
// estimate by hundreds of calories.
import type { AppState } from "../../shared/store/types";
import { computeEma, type EmaPoint } from "../profile/adaptive";
import { getAllDays, getRecentDays } from "../../shared/lib/analytics";

const KCAL_PER_KG = 7700;
const WINDOW = 14;

export interface ExpenditurePoint {
  date: string;
  kcal: number;
}

export function expenditureSeries(
  days: AppState["days"],
  weightLog: AppState["weightLog"],
  /** Days back, or null for the whole log. */
  span: number | null = 60
): ExpenditurePoint[] {
  const sorted = [...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ema = computeEma(sorted);
  if (ema.length < 2) return [];

  // Trend weight is only defined on days that were weighed, so it's
  // carried forward to every day in between — the trend doesn't stop
  // existing because you skipped the scale.
  const trendOn = (date: string): number | null => {
    let best: number | null = null;
    for (const p of ema) {
      if (p.date <= date) best = p.ema;
      else break;
    }
    return best;
  };

  const period = span == null ? getAllDays(days, weightLog) : getRecentDays(days, span);
  const out: ExpenditurePoint[] = [];

  for (let i = WINDOW - 1; i < period.length; i++) {
    const window = period.slice(i - WINDOW + 1, i + 1);
    const logged = window.filter((d) => d.total > 0);
    // A window that is mostly unlogged says nothing about intake, and an
    // estimate built on two days of food would be noise wearing a number.
    if (logged.length < WINDOW * 0.6) continue;

    const startTrend = trendOn(window[0].date);
    const endTrend = trendOn(window[window.length - 1].date);
    if (startTrend == null || endTrend == null) continue;

    const meanIntake = logged.reduce((s, d) => s + d.total, 0) / logged.length;
    const stored = ((endTrend - startTrend) * KCAL_PER_KG) / WINDOW;
    out.push({ date: window[window.length - 1].date, kcal: meanIntake - stored });
  }
  return out;
}

/** Observed weight change in kg per week, from the smoothed trend. */
export function trendRatePerWeek(ema: EmaPoint[]): number | null {
  if (ema.length < 2) return null;
  const first = ema[0];
  const last = ema[ema.length - 1];
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = (new Date(last.date).getTime() - new Date(first.date).getTime()) / dayMs;
  if (spanDays < 7) return null;
  return ((last.ema - first.ema) / spanDays) * 7;
}
