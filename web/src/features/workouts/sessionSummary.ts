// What a training day amounted to, for the session summary.
//
// The reference app shows this when you tap "Complete Workout", because
// it has an explicit session with a start and an end. This app has no
// such thing — a training day is a log you add to — so the same summary
// is computed for any day on demand rather than at a moment of
// completion.
import type { AppState, Exercise, ExerciseSet } from "../../shared/store/types";
import { computeWorkoutDayTotals, isBetterSet, isHoldSet } from "../../shared/lib/workouts";
import { setLoadKg } from "../../shared/lib/bodyweight";

export interface ExerciseSummary {
  id: string;
  name: string;
  sets: number;
  volume: number;
  reps: number;
  holdSeconds: number;
  best: ExerciseSet | null;
  /** The same exercise's best set on the most recent earlier day. */
  previousBest: ExerciseSet | null;
  /** Volume on that earlier day, for the delta. */
  previousVolume: number | null;
  /** Today's best beats everything logged before today. */
  isRecord: boolean;
}

export interface SessionSummary {
  totals: ReturnType<typeof computeWorkoutDayTotals>;
  exercises: ExerciseSummary[];
  records: ExerciseSummary[];
  timerSeconds: number;
  timerCount: number;
}

function exerciseVolume(ex: Exercise, bodyweightKg: number | null): number {
  return ex.sets.reduce(
    (sum, s) => sum + (s.reps ? setLoadKg(ex.name, s.weightKg, bodyweightKg) * s.reps : 0),
    0
  );
}

function bestOf(sets: ExerciseSet[]): ExerciseSet | null {
  let best: ExerciseSet | null = null;
  for (const s of sets) if (!best || isBetterSet(s, best)) best = s;
  return best;
}

export function summarizeSession(
  workouts: AppState["workouts"],
  dayKey: string,
  bodyweightKg: number | null = null
): SessionSummary | null {
  const day = workouts[dayKey];
  if (!day || (day.exercises.length === 0 && (day.timerLogs?.length ?? 0) === 0)) return null;

  // Every earlier day, newest first — used both for "what did I do last
  // time" and for whether today set a record.
  const earlierKeys = Object.keys(workouts)
    .filter((k) => k < dayKey)
    .sort()
    .reverse();

  const exercises: ExerciseSummary[] = day.exercises.map((ex) => {
    const key = ex.name.trim().toLowerCase();
    const mine = bestOf(ex.sets);

    let previousBest: ExerciseSet | null = null;
    let previousVolume: number | null = null;
    let bestBefore: ExerciseSet | null = null;
    for (const k of earlierKeys) {
      for (const other of workouts[k].exercises) {
        if (other.name.trim().toLowerCase() !== key) continue;
        const b = bestOf(other.sets);
        if (b && (!bestBefore || isBetterSet(b, bestBefore))) bestBefore = b;
        // The most recent earlier session, which is what "anterior" means
        // everywhere else in the app.
        if (previousBest === null) {
          previousBest = b;
          previousVolume = exerciseVolume(other, bodyweightKg);
        }
      }
    }

    return {
      id: ex.id,
      name: ex.name,
      sets: ex.sets.length,
      volume: exerciseVolume(ex, bodyweightKg),
      reps: ex.sets.reduce((sum, s) => sum + (isHoldSet(s) ? 0 : s.reps || 0), 0),
      holdSeconds: ex.sets.reduce((sum, s) => sum + (isHoldSet(s) ? s.holdSeconds || 0 : 0), 0),
      best: mine,
      previousBest,
      previousVolume,
      // A first-ever session isn't a record — there's nothing it beat.
      isRecord: !!mine && !!bestBefore && isBetterSet(mine, bestBefore)
    };
  });

  const logs = day.timerLogs ?? [];
  return {
    totals: computeWorkoutDayTotals(day.exercises, bodyweightKg),
    exercises,
    records: exercises.filter((e) => e.isRecord),
    timerSeconds: logs.reduce((sum, l) => sum + l.totalSeconds, 0),
    timerCount: logs.length
  };
}
