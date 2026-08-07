// Which pickers in the "Añadir" sheet start open.
//
// Ported from isSectionExpanded()/sectionUsedToday() in app.js: a section
// is open until you've used it today, then it folds away. Mid-session you
// don't want the warmup picker in the way of logging sets, but before you
// start it's the first thing you want. A manual tap overrides the guess
// for the rest of the day.
import { useState } from "react";
import type { AppState } from "../../shared/store/types";

export type SectionKey = "warmup" | "routines" | "stretch" | "exercises";

function usedToday(key: SectionKey, workouts: AppState["workouts"], dayKey: string): boolean {
  const day = workouts[dayKey];
  if (!day) return false;
  if (key === "warmup" || key === "stretch") {
    return (day.timerLogs ?? []).some((l) => l.category === key);
  }
  return day.exercises.length > 0; // routines and recent-exercises
}

export function useSectionCollapse(workouts: AppState["workouts"], dayKey: string) {
  const [overrides, setOverrides] = useState<Partial<Record<SectionKey, boolean>>>({});
  // Overrides are per-day: yesterday's decision shouldn't shape today.
  const [lastDay, setLastDay] = useState(dayKey);
  if (dayKey !== lastDay) {
    setLastDay(dayKey);
    setOverrides({});
  }

  const isExpanded = (key: SectionKey) =>
    overrides[key] ?? !usedToday(key, workouts, dayKey);

  const toggle = (key: SectionKey) =>
    setOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? !usedToday(key, workouts, dayKey)) }));

  return { isExpanded, toggle };
}
