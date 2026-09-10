// Progress toward the weight goal, which is what MacroFactor's Goal
// Progress widget reads.
//
// Measured against the smoothed trend rather than the latest weigh-in: a
// goal you complete on Tuesday and un-complete on Wednesday because of a
// salty dinner isn't progress, it's noise.
import type { Profile } from "../../shared/store/types";
import type { EmaPoint } from "../profile/adaptive";

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
