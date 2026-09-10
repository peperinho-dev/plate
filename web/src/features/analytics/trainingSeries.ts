// Training volume over time, in the four currencies a calisthenics log
// actually deals in.
//
// The reference app charts volume, reps and estimated 1-RM, all of which
// assume a barbell. Series is the honest default here because it counts
// every exercise; volume only means anything once bodyweight is treated
// as resistance, and time only applies to holds.
import type { AppState } from "../../shared/store/types";
import { isHoldSet } from "../../shared/lib/workouts";
import { bodyweightOn, exerciseShare, setLoadKg } from "../../shared/lib/bodyweight";

export type TrainingMetric = "sets" | "reps" | "hold" | "volume";

export const TRAINING_METRICS: { id: TrainingMetric; label: string; unit: string }[] = [
  { id: "sets", label: "Series", unit: "" },
  { id: "reps", label: "Reps", unit: "" },
  { id: "volume", label: "Volumen", unit: "kg" },
  { id: "hold", label: "Tiempo", unit: "s" }
];

export interface TrainingPoint {
  date: string;
  value: number;
  trained: boolean;
}

export function trainingSeries(
  workouts: AppState["workouts"],
  dateKeys: string[],
  metric: TrainingMetric,
  weightLog: AppState["weightLog"]
): TrainingPoint[] {
  return dateKeys.map((date) => {
    // Each day is valued at the bodyweight you were on that day, not the
    // one on the scale today.
    const bodyweightKg = bodyweightOn(weightLog, date);
    const exercises = workouts[date]?.exercises ?? [];
    let value = 0;
    exercises.forEach((ex) => {
      const share = exerciseShare(ex);
      ex.sets.forEach((s) => {
        if (metric === "sets") value += 1;
        else if (metric === "reps") value += isHoldSet(s) ? 0 : s.reps || 0;
        else if (metric === "hold") value += isHoldSet(s) ? s.holdSeconds || 0 : 0;
        else if (s.reps) value += setLoadKg(share, s.weightKg, bodyweightKg) * s.reps;
      });
    });
    return { date, value, trained: exercises.length > 0 };
  });
}

/**
 * How much of the period's volume came from movements the share table
 * doesn't recognise as bodyweight — i.e. how much is plain loaded work.
 * Surfaced so a volume figure can say what it's counting.
 */
export function bodyweightCoverage(
  workouts: AppState["workouts"],
  dateKeys: string[]
): { bodyweight: number; total: number } {
  let bodyweight = 0;
  let total = 0;
  dateKeys.forEach((date) => {
    (workouts[date]?.exercises ?? []).forEach((ex) => {
      total += 1;
      if (exerciseShare(ex) > 0) bodyweight += 1;
    });
  });
  return { bodyweight, total };
}
