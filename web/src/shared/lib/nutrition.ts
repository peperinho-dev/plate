// Derivation helpers over logged food entries, ported from app.js.
// All pure functions of (entries | state) so components can call them
// during render without touching the store.
import type { Entry, AppState } from "../store/types";

export interface HourGroup {
  hour: number;
  entries: Entry[];
  total: number;
}

export function groupEntriesByHour(entries: Entry[]): HourGroup[] {
  const groups = new Map<number, Entry[]>();
  entries.forEach((entry) => {
    const hour = new Date(entry.addedAt).getHours();
    if (!groups.has(hour)) groups.set(hour, []);
    groups.get(hour)!.push(entry);
  });
  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, groupEntries]) => ({
      hour,
      entries: groupEntries,
      total: groupEntries.reduce((sum, e) => sum + e.calories, 0)
    }));
}

export function sumCalories(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + e.calories, 0);
}

export interface MacroTotals {
  protein: number;
  fat: number;
  carbs: number;
}

export function sumMacros(entries: Entry[]): MacroTotals {
  return entries.reduce(
    (acc, e) => {
      acc.protein += e.protein || 0;
      acc.fat += e.fat || 0;
      acc.carbs += e.carbs || 0;
      return acc;
    },
    { protein: 0, fat: 0, carbs: 0 }
  );
}

export interface MicroTotals {
  fiber: number;
  sugar: number;
  sodium: number;
  hasAny: boolean;
}

export function sumMicros(entries: Entry[]): MicroTotals {
  return entries.reduce<MicroTotals>(
    (acc, e) => {
      acc.fiber += e.fiber || 0;
      acc.sugar += e.sugar || 0;
      acc.sodium += e.sodium || 0;
      acc.hasAny = acc.hasAny || !!(e.fiber || e.sugar || e.sodium);
      return acc;
    },
    { fiber: 0, sugar: 0, sodium: 0, hasAny: false }
  );
}

export function entriesForDay(state: AppState, dayKey: string): Entry[] {
  return state.days[dayKey]?.entries ?? [];
}

export function dayCalorieTotal(state: AppState, dayKey: string): number {
  return sumCalories(entriesForDay(state, dayKey));
}

// A day "hit the goal" only if something was actually logged — an empty
// day is not a success, it's just unlogged.
export function dayHitCalorieGoal(state: AppState, dayKey: string): boolean {
  const total = dayCalorieTotal(state, dayKey);
  if (total <= 0) return false;
  const { min, max } = state.calorieTarget;
  return !!(min && max && total >= min && total <= max);
}

export function hasWorkoutSession(state: AppState, dayKey: string): boolean {
  return !!(state.workouts[dayKey] && state.workouts[dayKey].exercises.length > 0);
}
