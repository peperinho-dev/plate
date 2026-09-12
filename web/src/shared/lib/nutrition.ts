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
 * The hours worth drawing: the ones with food in them, plus the hour it
 * is right now.
 *
 * This has been wrong twice in opposite directions. It first ran from the
 * first logged meal to the current hour, which made earlier hours
 * unreachable — log breakfast at 08:00 and there was no 07:00 row to tap.
 * Then every hour became a row, which fixed reaching them and replaced it
 * with nineteen rows of nothing to scroll past.
 *
 * Both were the same mistake: treating the timeline as the way to *pick*
 * an hour. It isn't — picking an hour is a grid of twenty-four chips that
 * costs four rows of height (see HourGrid). Once that exists the timeline
 * only has to show what happened, so it shows exactly that, plus now, so
 * that logging something you are eating right now is always one tap.
 *
 * MacroFactor solves the same problem with a configurable hour range,
 * hiding "the hours when they're usually asleep". That keeps every waking
 * hour as a row; this keeps none you didn't use, which is the same
 * intention taken further.
 */
export function timelineHours(entries: Entry[], currentHour: number | null): HourGroup[] {
  const byHour = new Map(groupEntriesByHour(entries).map((g) => [g.hour, g]));
  if (currentHour != null && !byHour.has(currentHour)) {
    byHour.set(currentHour, {
      hour: currentHour,
      entries: [],
      total: 0,
      macros: sumMacros([])
    });
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
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
