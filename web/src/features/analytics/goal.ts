// Progress toward the weight goal, which is what MacroFactor's Goal
// Progress widget reads.
//
// Measured against the smoothed trend rather than the latest weigh-in: a
// goal you complete on Tuesday and un-complete on Wednesday because of a
// salty dinner isn't progress, it's noise.
import type { Profile } from "../../shared/store/types";
import type { EmaPoint } from "../profile/adaptive";
import { formatDateKey, parseDateKey } from "../../shared/lib/date";
import { mondayOf } from "../../shared/lib/analytics";

export interface GoalReading {
  kind: "directional" | "maintain";
  /** 0..1 for directional goals; unused for maintain. */
  fraction: number;
  /** kg still to go for directional; signed deviation for maintain. */
  remaining: number;
  target: number;
  current: number;
  done: boolean;
}

/** How far outside the target a maintenance goal is allowed to drift. */
export const MAINTAIN_BAND_KG = 0.68;

export function readGoal(profile: Profile, ema: EmaPoint[]): GoalReading | null {
  const target = profile.targetWeightKg;
  if (target == null || ema.length === 0 || !profile.goalType) return null;

  const current = ema[ema.length - 1].ema;

  if (profile.goalType === "maintain") {
    return {
      kind: "maintain",
      fraction: 0,
      remaining: current - target,
      target,
      current,
      done: Math.abs(current - target) <= MAINTAIN_BAND_KG
    };
  }

  // The start of the goal is the earliest trend point available. It's an
  // approximation — the app doesn't record when a goal was set — so a
  // goal changed mid-stream measures from the old beginning until enough
  // new history accumulates.
  const start = ema[0].ema;
  const span = target - start;
  const moved = current - start;

  // A goal whose start already equals its target has no span to divide
  // by; treat it as complete rather than dividing by zero.
  const fraction = Math.abs(span) < 0.05 ? 1 : Math.max(0, Math.min(1, moved / span));
  const remaining = target - current;
  const done =
    profile.goalType === "lose" ? current <= target : current >= target;

  return { kind: "directional", fraction, remaining, target, current, done };
}

/**
 * The goal broken into weeks — what the reference app's Goal Progress
 * screen charts.
 *
 * A single "4.3 kg to go" figure says where you are but not how you got
 * there, and gaining weight is a weekly business: the question you
 * actually have is whether last week moved you the right amount, and
 * whether the week before that did too. Each entry is one Monday-to-
 * Sunday block of the smoothed trend.
 *
 * Measured on the trend, not the scale, for the same reason the headline
 * is: a week that ends on a salty dinner isn't a week you failed.
 */
export interface GoalWeek {
  /** Day key of that week's Monday. */
  weekStart: string;
  /** Trend weight at the start and end of the week. */
  startEma: number;
  endEma: number;
  /** Signed change across the week, in kg. */
  change: number;
  /** Cumulative change since the first week shown. */
  cumulative: number;
  /** How many weigh-ins the week's trend rests on. */
  readings: number;
}

export function goalWeeks(ema: EmaPoint[]): GoalWeek[] {
  if (ema.length === 0) return [];
  const buckets = new Map<string, EmaPoint[]>();
  for (const point of ema) {
    const key = formatDateKey(mondayOf(parseDateKey(point.date)));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }

  const weekStarts = Array.from(buckets.keys()).sort();
  const out: GoalWeek[] = [];
  let cumulative = 0;
  let previousEnd: number | null = null;

  for (const weekStart of weekStarts) {
    const points = buckets.get(weekStart)!.sort((a, b) => (a.date < b.date ? -1 : 1));
    const endEma = points[points.length - 1].ema;
    // A week's change is measured from where the *previous* week left
    // off, not from its own first reading — otherwise everything that
    // happened between Sunday night and the next weigh-in falls into a
    // gap between the bars and the totals stop adding up.
    const startEma = previousEnd ?? points[0].ema;
    const change = endEma - startEma;
    cumulative += change;
    out.push({ weekStart, startEma, endEma, change, cumulative, readings: points.length });
    previousEnd = endEma;
  }
  return out;
}

/**
 * The signed weekly rate the profile is aiming at — positive for a bulk,
 * negative for a cut, null when there's no rate to compare against. The
 * profile stores the magnitude and the direction separately.
 */
export function targetWeeklyRate(profile: Profile): number | null {
  if (profile.rateKgPerWeek == null || !profile.goalType || profile.goalType === "maintain") return null;
  return profile.goalType === "lose"
    ? -Math.abs(profile.rateKgPerWeek)
    : Math.abs(profile.rateKgPerWeek);
}
