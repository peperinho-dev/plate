// Progression groups: free-text tags shared by variants of the same
// movement ("Flexiones de rodillas" and "Flexiones" both tagged
// "Flexiones"). Ordering variants by when each was first used gives a
// difficulty timeline for free, without anyone predefining stages.
import type { AppState, ExerciseSet } from "../../shared/store/types";
import { isBetterSet } from "../../shared/lib/workouts";

export interface Variant {
  name: string;
  firstDate: string;
  lastDate: string;
  sessionCount: number;
  bestSet: ExerciseSet | null;
}

export function collectProgressionGroups(workouts: AppState["workouts"]): Map<string, Variant[]> {
  const groups = new Map<string, Map<string, Variant>>();

  Object.entries(workouts).forEach(([dayKey, day]) => {
    day.exercises.forEach((ex) => {
      if (!ex.progressionGroup) return;
      if (!groups.has(ex.progressionGroup)) groups.set(ex.progressionGroup, new Map());
      const variants = groups.get(ex.progressionGroup)!;
      const key = ex.name.trim().toLowerCase();

      if (!variants.has(key)) {
        variants.set(key, { name: ex.name, firstDate: dayKey, lastDate: dayKey, sessionCount: 0, bestSet: null });
      }
      const v = variants.get(key)!;
      if (dayKey < v.firstDate) v.firstDate = dayKey;
      if (dayKey > v.lastDate) {
        v.lastDate = dayKey;
        v.name = ex.name;
      }
      if (ex.sets.length > 0) v.sessionCount += 1;
      ex.sets.forEach((s) => {
        if (!v.bestSet || isBetterSet(s, v.bestSet)) v.bestSet = s;
      });
    });
  });

  const result = new Map<string, Variant[]>();
  groups.forEach((variants, groupName) => {
    result.set(
      groupName,
      Array.from(variants.values()).sort((a, b) => (a.firstDate < b.firstDate ? -1 : 1))
    );
  });
  return result;
}
