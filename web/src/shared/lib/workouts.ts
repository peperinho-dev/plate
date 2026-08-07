// Workout derivations, ported from app.js.
//
// Everything here has to cope with three kinds of set, because the app is
// used for calisthenics: weighted (weight x reps), plain reps, and timed
// holds (planks, L-sits). A set is a hold when holdSeconds is present.
import type { AppState, Exercise, ExerciseSet } from "../store/types";

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isHoldSet(s: ExerciseSet): boolean {
  return s.holdSeconds !== null && s.holdSeconds !== undefined;
}

export function formatSet(s: ExerciseSet): string {
  if (isHoldSet(s)) {
    const dur = formatDuration(s.holdSeconds!);
    return s.weightKg !== null && s.weightKg !== undefined ? `${s.weightKg}×${dur}` : dur;
  }
  return s.weightKg !== null && s.weightKg !== undefined ? `${s.weightKg}×${s.reps}` : `${s.reps} reps`;
}

export function summarizeExercise(ex: Exercise): string {
  const n = ex.sets.length;
  if (n === 0) return "Sin series";
  const label = `${n} serie${n === 1 ? "" : "s"}`;

  const hasWeight = ex.sets.some((s) => s.weightKg !== null && s.weightKg !== undefined);
  if (hasWeight) {
    const volume = ex.sets.reduce((sum, s) => sum + (s.weightKg && s.reps ? s.weightKg * s.reps : 0), 0);
    return `${label} · ${Math.round(volume)} kg vol.`;
  }

  const hasHold = ex.sets.some(isHoldSet);
  if (hasHold) {
    const totalSeconds = ex.sets.reduce((sum, s) => sum + (s.holdSeconds || 0), 0);
    return `${label} · ${formatDuration(totalSeconds)} total`;
  }

  const reps = ex.sets.map((s) => s.reps);
  const allSame = reps.every((r) => r === reps[0]);
  return allSame ? `${n}×${reps[0]} reps` : `${label} · ${reps.reduce((a, b) => (a || 0) + (b || 0), 0)} reps`;
}

export interface WorkoutDayTotals {
  sets: number;
  volume: number;
  reps: number;
  holdSeconds: number;
}

export function computeWorkoutDayTotals(exercises: Exercise[]): WorkoutDayTotals {
  let sets = 0;
  let volume = 0;
  let reps = 0;
  let holdSeconds = 0;
  exercises.forEach((ex) => {
    ex.sets.forEach((s) => {
      sets += 1;
      if (isHoldSet(s)) holdSeconds += s.holdSeconds!;
      else reps += s.reps || 0;
      if (s.weightKg !== null && s.weightKg !== undefined && s.reps) volume += s.weightKg * s.reps;
    });
  });
  return { sets, volume, reps, holdSeconds };
}

// Heavier always wins; at equal load, more reps (or a longer hold) wins.
export function isBetterSet(a: ExerciseSet, b: ExerciseSet): boolean {
  const aw = a.weightKg || 0;
  const bw = b.weightKg || 0;
  if (aw !== bw) return aw > bw;
  const aVal = isHoldSet(a) ? a.holdSeconds! : a.reps || 0;
  const bVal = isHoldSet(b) ? b.holdSeconds! : b.reps || 0;
  return aVal > bVal;
}

export function findExercisePR(workouts: AppState["workouts"], name: string): ExerciseSet | null {
  const key = name.trim().toLowerCase();
  let best: ExerciseSet | null = null;
  Object.values(workouts).forEach((day) => {
    day.exercises.forEach((ex) => {
      if (ex.name.trim().toLowerCase() !== key) return;
      ex.sets.forEach((s) => {
        if (!best || isBetterSet(s, best)) best = s;
      });
    });
  });
  return best;
}

export interface LastPerformance {
  dayKey: string;
  ex: Exercise;
}

// The most recent *earlier* session for this exercise — used to show what
// you did last time while you're logging today's sets.
export function findLastExerciseSets(
  workouts: AppState["workouts"],
  name: string,
  beforeDayKey: string
): LastPerformance | null {
  const key = name.trim().toLowerCase();
  const candidates: LastPerformance[] = [];
  Object.entries(workouts).forEach(([dayKey, day]) => {
    if (dayKey >= beforeDayKey) return;
    day.exercises.forEach((ex) => {
      if (ex.name.trim().toLowerCase() === key && ex.sets.length > 0) candidates.push({ dayKey, ex });
    });
  });
  candidates.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  return candidates[0] || null;
}

export function countWorkoutSessions(workouts: AppState["workouts"]): number {
  return Object.values(workouts).filter((day) => day.exercises.length > 0).length;
}

// Every distinct exercise name ever logged — the full vocabulary,
// unranked and uncapped.
export function collectAllExerciseNames(workouts: AppState["workouts"]): string[] {
  const names = new Set<string>();
  Object.values(workouts).forEach((day) => {
    day.exercises.forEach((ex) => names.add(ex.name));
  });
  return Array.from(names).sort();
}

export function computeFrequentExercises(workouts: AppState["workouts"], limit = 8) {
  const tally = new Map<string, { name: string; count: number; lastAddedAt: number }>();
  Object.values(workouts).forEach((day) => {
    day.exercises.forEach((ex) => {
      const key = ex.name.trim().toLowerCase();
      if (!key) return;
      const existing = tally.get(key);
      if (existing) {
        existing.count += 1;
        if (ex.addedAt > existing.lastAddedAt) {
          existing.lastAddedAt = ex.addedAt;
          existing.name = ex.name;
        }
      } else {
        tally.set(key, { name: ex.name, count: 1, lastAddedAt: ex.addedAt });
      }
    });
  });
  return Array.from(tally.values())
    .sort((a, b) => b.count - a.count || b.lastAddedAt - a.lastAddedAt)
    .slice(0, limit);
}

// --- Exercise catalog (search) ----------------------------------------

export interface CatalogEntry {
  name: string;
  /** Most recent day this was performed before today, if any. */
  lastDayKey: string | null;
  lastSummary: string | null;
  lastAddedAt: number;
}

// Diacritic-insensitive so "platano" finds "Plátano" and "dominadas"
// finds "Dominadas" regardless of how the keyboard behaved.
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Every exercise ever logged, most-recently-used first, each with a short
// "what you did last time" hint. This is the single list the Añadir sheet
// searches — recents and the full history are the same thing ranked, not
// two separate mechanisms.
export function computeExerciseCatalog(
  workouts: AppState["workouts"],
  beforeDayKey: string
): CatalogEntry[] {
  const byName = new Map<string, CatalogEntry>();
  Object.entries(workouts).forEach(([dayKey, day]) => {
    day.exercises.forEach((ex) => {
      const key = foldText(ex.name);
      if (!key) return;
      // Ranking ignores today on purpose: if adding an exercise bumped it
      // to the top, the list would reshuffle under your thumb every time
      // you tapped one. Today's additions are visible in the track above
      // instead. Something first done today still appears, ranked last.
      const rankAt = dayKey < beforeDayKey ? ex.addedAt : 0;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { name: ex.name, lastDayKey: null, lastSummary: null, lastAddedAt: rankAt });
      } else if (rankAt > existing.lastAddedAt) {
        byName.set(key, { ...existing, name: ex.name, lastAddedAt: rankAt });
      }
    });
  });

  // The hint deliberately looks only at *earlier* days: "last time" during
  // today's session means the previous session, not the set you just did.
  byName.forEach((entry, key) => {
    const last = findLastExerciseSets(workouts, entry.name, beforeDayKey);
    if (last) {
      byName.set(key, {
        ...entry,
        lastDayKey: last.dayKey,
        lastSummary: last.ex.sets.map(formatSet).join(", ")
      });
    }
  });

  return Array.from(byName.values()).sort((a, b) => b.lastAddedAt - a.lastAddedAt);
}

// Ranks a query against the catalog: things that *start* with what you
// typed come before things that merely contain it, so "pre" puts "Press
// banca" above "Sentadilla con press".
export function searchCatalog(catalog: CatalogEntry[], query: string): CatalogEntry[] {
  const q = foldText(query);
  if (!q) return catalog;
  return catalog
    .filter((e) => foldText(e.name).includes(q))
    .sort((a, b) => {
      const aStarts = foldText(a.name).startsWith(q) ? 0 : 1;
      const bStarts = foldText(b.name).startsWith(q) ? 0 : 1;
      return aStarts - bStarts || b.lastAddedAt - a.lastAddedAt;
    });
}
