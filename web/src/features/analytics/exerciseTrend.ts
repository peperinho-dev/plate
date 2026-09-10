// Per-exercise history, for the breakdown you reach from the top-exercises
// list under the training chart.
//
// Which number to chart isn't fixed: a weighted movement progresses in
// kilos, a bodyweight one in reps, a hold in seconds. Charting volume for
// all three would draw a flat line for the plank and call it a plateau,
// so the metric is chosen from what the exercise is actually logged in.
import type { AppState, Exercise } from "../../shared/store/types";
import { isHoldSet } from "../../shared/lib/workouts";
import { bodyweightOn, exerciseShare, setLoadKg } from "../../shared/lib/bodyweight";

export interface ExerciseTally {
  name: string;
  sets: number;
  reps: number;
  holdSeconds: number;
  volume: number;
}

export function topExercises(
  workouts: AppState["workouts"],
  dateKeys: string[],
  weightLog: AppState["weightLog"],
  limit = 5
): ExerciseTally[] {
  const byName = new Map<string, ExerciseTally>();
  dateKeys.forEach((date) => {
    const bw = bodyweightOn(weightLog, date);
    (workouts[date]?.exercises ?? []).forEach((ex) => {
      const key = ex.name.trim().toLowerCase();
      const share = exerciseShare(ex);
      const t =
        byName.get(key) ?? { name: ex.name, sets: 0, reps: 0, holdSeconds: 0, volume: 0 };
      ex.sets.forEach((s) => {
        t.sets += 1;
        if (isHoldSet(s)) t.holdSeconds += s.holdSeconds || 0;
        else t.reps += s.reps || 0;
        if (s.reps) t.volume += setLoadKg(share, s.weightKg, bw) * s.reps;
      });
      byName.set(key, t);
    });
  });
  return [...byName.values()].sort((a, b) => b.sets - a.sets).slice(0, limit);
}

export type ExerciseMetric = "volume" | "reps" | "hold";

export interface ExerciseSessionPoint {
  date: string;
  value: number;
  /** Best single set that session, for the headline. */
  bestLabel: string;
}

/** Whichever dial this movement actually moves. */
export function metricFor(exercises: Exercise[]): ExerciseMetric {
  const sets = exercises.flatMap((e) => e.sets);
  if (sets.length === 0) return "reps";
  if (sets.every((s) => isHoldSet(s))) return "hold";
  return sets.some((s) => s.weightKg != null && s.weightKg > 0) ? "volume" : "reps";
}

export function exerciseHistory(
  workouts: AppState["workouts"],
  name: string,
  weightLog: AppState["weightLog"]
): { points: ExerciseSessionPoint[]; metric: ExerciseMetric; all: Exercise[] } {
  const key = name.trim().toLowerCase();
  const dates = Object.keys(workouts).sort();
  const all: Exercise[] = [];
  const points: ExerciseSessionPoint[] = [];

  dates.forEach((date) => {
    const matches = (workouts[date]?.exercises ?? []).filter(
      (e) => e.name.trim().toLowerCase() === key
    );
    if (matches.length === 0) return;
    all.push(...matches);
  });

  const metric = metricFor(all);

  dates.forEach((date) => {
    const matches = (workouts[date]?.exercises ?? []).filter(
      (e) => e.name.trim().toLowerCase() === key
    );
    if (matches.length === 0) return;
    const bw = bodyweightOn(weightLog, date);
    let value = 0;
    let best = 0;
    matches.forEach((ex) => {
      const share = exerciseShare(ex);
      ex.sets.forEach((s) => {
        if (metric === "hold") {
          value += s.holdSeconds || 0;
          best = Math.max(best, s.holdSeconds || 0);
        } else if (metric === "reps") {
          value += s.reps || 0;
          best = Math.max(best, s.reps || 0);
        } else if (s.reps) {
          value += setLoadKg(share, s.weightKg, bw) * s.reps;
          best = Math.max(best, s.weightKg ?? 0);
        }
      });
    });
    points.push({
      date,
      value,
      bestLabel:
        metric === "hold"
          ? `${best}s`
          : metric === "reps"
            ? `${best} reps`
            : `${best} kg`
    });
  });

  return { points, metric, all };
}
