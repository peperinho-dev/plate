// Warm-up sets, ramped from the set you're about to work at.
//
// Article 304 describes their scheme as percentages of the working set —
// 40%, 60%, 80% — auto-added before you start. That's a barbell idea, and
// it half-transfers: the ramp is right, but "percentage of the weight"
// means nothing for a movement whose load is your own body.
//
// So the ramp applies to whatever the set is actually measured in. A
// weighted set ramps its weight. A bodyweight set ramps its reps, because
// that's the only dial there is. A hold ramps its seconds.
//
// Kept deliberately dumb — two sets, fixed fractions — because a warm-up
// scheme with its own settings page is exactly the "full on" complexity
// this app is trying not to have. It's a starting point you then edit in
// the table like any other set.
import type { ExerciseSet } from "../../shared/store/types";
import { isHoldSet } from "../../shared/lib/workouts";

export interface WarmupSet {
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  type: "warmup";
}

const RAMP = [0.5, 0.75];

/** Rounded to the nearest 2.5 kg, which is what plates and dumbbells come in. */
function roundLoad(kg: number): number {
  return Math.max(0, Math.round(kg / 2.5) * 2.5);
}

/**
 * Two warm-up sets leading into `target`. Empty when there's nothing to
 * ramp — a set with neither load, reps nor duration says nothing about
 * how to approach it.
 */
export function warmupSetsFor(target: ExerciseSet | null): WarmupSet[] {
  if (!target) return [];

  if (isHoldSet(target) && target.holdSeconds) {
    return RAMP.map((f) => ({
      weightKg: target.weightKg ?? null,
      reps: null,
      holdSeconds: Math.max(5, Math.round(target.holdSeconds! * f)),
      type: "warmup" as const
    }));
  }

  const reps = target.reps ?? 0;
  if (!reps) return [];

  // Weighted: ramp the load and keep reps modest, the way a lifter warms
  // up. Bodyweight: the load is fixed, so ramp the reps instead.
  if (target.weightKg != null && target.weightKg > 0) {
    return RAMP.map((f) => ({
      weightKg: roundLoad(target.weightKg! * f),
      reps: Math.max(1, Math.round(reps * 0.6)),
      holdSeconds: null,
      type: "warmup" as const
    }));
  }

  return RAMP.map((f) => ({
    weightKg: null,
    reps: Math.max(1, Math.round(reps * f)),
    holdSeconds: null,
    type: "warmup" as const
  }));
}
