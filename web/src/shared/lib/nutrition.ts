// Derivation helpers over logged food entries, ported from app.js.
// All pure functions of (entries | state) so components can call them
// during render without touching the store.
import type { Entry, AppState } from "../store/types";

export interface HourGroup {
  hour: number;
  entries: Entry[];
  total: number;
  macros: MacroTotals;
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
      total: groupEntries.reduce((sum, e) => sum + e.calories, 0),
      macros: sumMacros(groupEntries)
    }));
}

/**
 * The day as rows, 00:00 through 23:00 minus the small hours.
 *
 * This used to run from the first logged meal to the current hour, which
 * quietly made some hours unreachable: log breakfast at 08:00 and there
 * was no 07:00 row to tap, and an untouched day drew no timeline at all.
 * So every hour became a row — and then 01:00 to 05:00 were five rows of
 * nothing at the top of every single day, which is the kind of wasted
 * space the rest of this app has been stripped of.
 *
 * They are skipped, but never when they hold food: an hour with entries
 * is always drawn, whatever time it is. Hiding a row is a layout choice;
 * hiding something you logged would be a lie.
 */
const QUIET_HOURS = new Set([1, 2, 3, 4, 5]);

export function timelineHours(entries: Entry[]): HourGroup[] {
  const byHour = new Map(groupEntriesByHour(entries).map((g) => [g.hour, g]));
  const out: HourGroup[] = [];
  for (let h = 0; h < 24; h++) {
    const group = byHour.get(h);
    if (!group && QUIET_HOURS.has(h)) continue;
    out.push(group ?? { hour: h, entries: [], total: 0, macros: sumMacros([]) });
  }
  return out;
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

// These take the narrowest slice they need rather than the whole AppState,
// so components can subscribe per-slice instead of to the entire store —
// subscribing to everything re-renders the week strip and calendar on any
// unrelated change (a workout set, a profile edit).
export function entriesForDay(days: AppState["days"], dayKey: string): Entry[] {
  return days[dayKey]?.entries ?? [];
}

export function dayCalorieTotal(days: AppState["days"], dayKey: string): number {
  return sumCalories(entriesForDay(days, dayKey));
}

// A day "hit the goal" only if something was actually logged — an empty
// day is not a success, it's just unlogged.
export function dayHitCalorieGoal(
  days: AppState["days"],
  calorieTarget: AppState["calorieTarget"],
  dayKey: string
): boolean {
  const total = dayCalorieTotal(days, dayKey);
  if (total <= 0) return false;
  const { min, max } = calorieTarget;
  return !!(min && max && total >= min && total <= max);
}

export function hasWorkoutSession(workouts: AppState["workouts"], dayKey: string): boolean {
  return !!(workouts[dayKey] && workouts[dayKey].exercises.length > 0);
}
