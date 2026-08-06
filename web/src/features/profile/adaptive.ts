// Adaptive target suggestions, ported from app.js.
//
// Compares the *smoothed* weight trend against the rate the user asked
// for, and proposes a calorie adjustment when they've drifted apart. The
// suggestion is always confirmed by the user — targets are never silently
// rewritten underneath them.
import { useAppStore } from "../../shared/store";
import type { AppState, WeightEntry } from "../../shared/store/types";
import { DAY_MS, formatDateKey, parseDateKey } from "../../shared/lib/date";

const ADAPTIVE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const ADAPTIVE_MIN_SPAN_DAYS = 14;
// Below this the difference is indistinguishable from normal fluctuation.
const ADAPTIVE_THRESHOLD_KG_PER_WEEK = 0.15;
const KCAL_PER_KG = 7700;

export interface EmaPoint {
  date: string;
  raw: number;
  ema: number;
}

// Daily weight is noisy — an exponential moving average is what makes a
// trend readable without waiting weeks.
export function computeEma(sortedEntries: WeightEntry[], alpha = 0.25): EmaPoint[] {
  let ema: number | null = null;
  return sortedEntries.map((e) => {
    ema = ema === null ? e.weightKg : alpha * e.weightKg + (1 - alpha) * ema;
    return { date: e.date, raw: e.weightKg, ema };
  });
}

export interface AdaptiveSuggestionResult {
  deltaKcal: number;
  actualRate: number;
  createdAt: number;
  dismissed: boolean;
}

// Returns the suggestion, or null when there isn't enough evidence.
export function computeAdaptiveSuggestion(state: AppState): AdaptiveSuggestionResult | null {
  const profile = state.profile;
  if (!profile.goalType || profile.goalType === "maintain") return null;
  if (profile.rateKgPerWeek === null || profile.rateKgPerWeek === undefined) return null;

  const sorted = [...state.weightLog].sort((x, y) => (x.date < y.date ? -1 : 1));
  if (sorted.length < 4) return null;

  const spanDays =
    (parseDateKey(sorted[sorted.length - 1].date).getTime() - parseDateKey(sorted[0].date).getTime()) / DAY_MS;
  if (spanDays < ADAPTIVE_MIN_SPAN_DAYS) return null;

  const withEma = computeEma(sorted);
  const latest = withEma[withEma.length - 1];
  const cutoff = parseDateKey(latest.date);
  cutoff.setDate(cutoff.getDate() - ADAPTIVE_MIN_SPAN_DAYS);
  const cutoffStr = formatDateKey(cutoff);
  const refEntry = withEma.find((e) => e.date >= cutoffStr) ?? withEma[0];

  const daysBetween =
    (parseDateKey(latest.date).getTime() - parseDateKey(refEntry.date).getTime()) / DAY_MS;
  if (daysBetween < 7) return null;

  const actualRate = ((latest.ema - refEntry.ema) / daysBetween) * 7;
  const goalRateSigned = profile.goalType === "lose" ? -profile.rateKgPerWeek : profile.rateKgPerWeek;
  const diff = goalRateSigned - actualRate;
  if (Math.abs(diff) < ADAPTIVE_THRESHOLD_KG_PER_WEEK) return null;

  // Rounded to 25 kcal — false precision would imply the estimate is
  // sharper than it is.
  const deltaKcal = Math.round((diff * KCAL_PER_KG) / 7 / 25) * 25;
  if (deltaKcal === 0) return null;

  return {
    deltaKcal,
    actualRate: Math.round(actualRate * 100) / 100,
    createdAt: Date.now(),
    dismissed: false
  };
}

// Weekly cadence: runs at most once every seven days so the suggestion
// doesn't churn with every weigh-in.
export function maybeCheckAdaptive() {
  const state = useAppStore.getState();
  const last = state.adaptive.lastCheckedAt;
  if (last && Date.now() - last < ADAPTIVE_CHECK_INTERVAL_MS) return;
  useAppStore.setState({
    adaptive: { lastCheckedAt: Date.now(), suggestion: computeAdaptiveSuggestion(state) }
  });
}

export function acceptAdaptiveSuggestion() {
  useAppStore.setState((s) => {
    const delta = s.adaptive.suggestion?.deltaKcal ?? 0;
    if (!delta) return {};
    return {
      // Accepting makes the range manual: the user has overridden what the
      // profile-based calculation would produce.
      calorieTarget: {
        ...s.calorieTarget,
        mode: "manual" as const,
        min: Math.max(0, s.calorieTarget.min + delta),
        max: s.calorieTarget.max + delta
      },
      adaptive: { ...s.adaptive, suggestion: null }
    };
  });
}

export function dismissAdaptiveSuggestion() {
  useAppStore.setState((s) => ({
    adaptive: {
      ...s.adaptive,
      suggestion: s.adaptive.suggestion ? { ...s.adaptive.suggestion, dismissed: true } : null
    }
  }));
}
