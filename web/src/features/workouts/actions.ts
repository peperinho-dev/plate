// Workout mutations. Same discipline as the nutrition actions: standalone
// functions over setState, keeping AppState pure serializable data.
import { useAppStore } from "../../shared/store";
import type { AppState, Exercise, ExerciseSet, SetType } from "../../shared/store/types";
import { newId } from "../../shared/lib/id";
import { rebaseTimeToDay } from "../../shared/lib/date";

function updateWorkoutDay(state: AppState, dayKey: string, exercises: Exercise[]): Partial<AppState> {
  return {
    workouts: {
      ...state.workouts,
      [dayKey]: { ...state.workouts[dayKey], exercises }
    }
  };
}

export function addExercise(dayKey: string, name: string): string {
  const id = newId();
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(s, dayKey, [...existing, { id, name, sets: [], addedAt: Date.now() }]);
  });
  return id;
}

export function removeExercise(dayKey: string, exerciseId: string) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(s, dayKey, existing.filter((e) => e.id !== exerciseId));
  });
}

export function renameExercise(dayKey: string, exerciseId: string, name: string, progressionGroup: string | null) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(
      s,
      dayKey,
      existing.map((e) => (e.id === exerciseId ? { ...e, name, progressionGroup } : e))
    );
  });
}

export interface SetInput {
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  type: SetType;
}

export function addSet(dayKey: string, exerciseId: string, input: SetInput) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(
      s,
      dayKey,
      existing.map((e) =>
        e.id === exerciseId ? { ...e, sets: [...e.sets, { id: newId(), ...input, addedAt: Date.now() }] } : e
      )
    );
  });
}

export function updateSet(dayKey: string, exerciseId: string, setId: string, input: SetInput) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(
      s,
      dayKey,
      existing.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.map((st) => (st.id === setId ? { ...st, ...input } : st)) }
          : e
      )
    );
  });
}

export function removeSet(dayKey: string, exerciseId: string, setId: string) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(
      s,
      dayKey,
      existing.map((e) => (e.id === exerciseId ? { ...e, sets: e.sets.filter((st) => st.id !== setId) } : e))
    );
  });
}

export function restoreSet(dayKey: string, exerciseId: string, set: ExerciseSet, index: number) {
  useAppStore.setState((s) => {
    const existing = s.workouts[dayKey]?.exercises ?? [];
    return updateWorkoutDay(
      s,
      dayKey,
      existing.map((e) => {
        if (e.id !== exerciseId) return e;
        const sets = e.sets.slice();
        sets.splice(Math.min(index, sets.length), 0, set);
        return { ...e, sets };
      })
    );
  });
}

// Copies a whole session onto another day, rebasing timestamps so the
// pasted session reads as happening at the same times.
export function copyWorkoutToDay(exercises: Exercise[], targetDayKey: string) {
  useAppStore.setState((s) => {
    const existing = s.workouts[targetDayKey]?.exercises ?? [];
    const copies = exercises.map((ex) => {
      const newExerciseId = newId();
      return {
        id: newExerciseId,
        name: ex.name,
        progressionGroup: ex.progressionGroup ?? null,
        addedAt: rebaseTimeToDay(ex.addedAt, targetDayKey),
        sets: ex.sets.map((st) => ({
          id: `${newExerciseId}-${Math.random().toString(36).slice(2, 7)}`,
          weightKg: st.weightKg,
          reps: st.reps,
          holdSeconds: st.holdSeconds ?? null,
          type: st.type || ("normal" as SetType),
          addedAt: rebaseTimeToDay(st.addedAt, targetDayKey)
        }))
      };
    });
    return updateWorkoutDay(s, targetDayKey, [...existing, ...copies]);
  });
}

export function setWeeklySessionGoal(weeklySessions: number) {
  useAppStore.setState((s) => ({ workoutGoal: { ...s.workoutGoal, weeklySessions } }));
}

export function setRestSeconds(restSeconds: number) {
  useAppStore.setState((s) => ({ workoutGoal: { ...s.workoutGoal, restSeconds } }));
}
