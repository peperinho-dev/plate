// Analytics derivations, ported from app.js.
import type { AppState, ExerciseSet } from "../store/types";
import { todayKey } from "./date";
import { sumMacros } from "./nutrition";
import { isHoldSet } from "./workouts";

export interface DayStat {
  date: string;
  total: number;
  protein: number;
  fat: number;
  carbs: number;
}

export function getRecentDays(days: AppState["days"], n: number): DayStat[] {
  const result: DayStat[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = todayKey(-i);
    const entries = days[key]?.entries ?? [];
    result.push({
      date: key,
      total: entries.reduce((sum, e) => sum + e.calories, 0),
      ...sumMacros(entries)
    });
  }
  return result;
}

export function getAllDays(days: AppState["days"], weightLog: AppState["weightLog"]): DayStat[] {
  const withFood = Object.keys(days).filter((k) => days[k].entries.length > 0);
  const allKeys = [...withFood, ...weightLog.map((w) => w.date)];
  if (allKeys.length === 0) return getRecentDays(days, 7);

  const earliest = allKeys.reduce((min, k) => (k < min ? k : min));
  const [y, m, d] = earliest.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const result: DayStat[] = [];
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const entries = days[key]?.entries ?? [];
    result.push({
      date: key,
      total: entries.reduce((sum, e) => sum + e.calories, 0),
      ...sumMacros(entries)
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export interface ExerciseRecord {
  name: string;
  value: number;
}

// Best reps (or longest hold) per exercise inside the period. Weight isn't
// the axis here because the app is used for calisthenics — progress shows
// up as more reps or a longer hold, not more load.
export function computeExerciseRecords(
  workouts: AppState["workouts"],
  dateKeys: Set<string>,
  mode: "reps" | "hold",
  limit = 6
): ExerciseRecord[] {
  const best = new Map<string, ExerciseRecord>();
  Object.entries(workouts).forEach(([dayKey, day]) => {
    if (!dateKeys.has(dayKey)) return;
    day.exercises.forEach((ex) => {
      ex.sets.forEach((s: ExerciseSet) => {
        const hold = isHoldSet(s);
        if (mode === "hold" ? !hold : hold) return;
        const value = hold ? s.holdSeconds! : s.reps ?? 0;
        if (!value) return;
        const existing = best.get(ex.name);
        if (!existing || value > existing.value) best.set(ex.name, { name: ex.name, value });
      });
    });
  });
  return Array.from(best.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface TopContributor {
  name: string;
  total: number;
}

export function computeTopContributors(
  days: AppState["days"],
  dateKeys: Set<string>,
  limit = 8
): TopContributor[] {
  const tally = new Map<string, TopContributor>();
  Object.entries(days).forEach(([dayKey, day]) => {
    if (!dateKeys.has(dayKey)) return;
    day.entries.forEach((e) => {
      const key = e.name.trim().toLowerCase();
      if (!key) return;
      const existing = tally.get(key);
      if (existing) existing.total += e.calories;
      else tally.set(key, { name: e.name, total: e.calories });
    });
  });
  return Array.from(tally.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function countSessionsInPeriod(workouts: AppState["workouts"], dateKeys: Set<string>): number {
  let count = 0;
  dateKeys.forEach((k) => {
    if (workouts[k] && workouts[k].exercises.length > 0) count += 1;
  });
  return count;
}
