// Week math for the dashboard's weekly widgets.
//
// MacroFactor's "Nutrition & Targets" widget shows the current week with
// the day in progress boxed, so the week has to be Monday-anchored and
// include days that haven't happened yet — a Wednesday view still shows
// Thursday through Sunday as empty slots, because the point is the shape
// of the week, not a list of what exists.
import type { AppState } from "../../shared/store/types";
import { todayKey } from "../../shared/lib/date";
import { sumMacros } from "../../shared/lib/nutrition";
import { WEEKDAY_LETTERS_MON, WEEKDAYS, MONTHS, capitalizeFirst } from "../../shared/lib/format";

export interface WeekDay {
  date: string;
  letter: string;
  /** "Lunes, 7 sep" — for the caption when a day is brought into focus. */
  label: string;
  total: number;
  protein: number;
  fat: number;
  carbs: number;
  isToday: boolean;
  isFuture: boolean;
}

/** Offset from today back to Monday of the current week. */
function mondayOffset(d = new Date()): number {
  // getDay() is Sunday-first; the app's week starts Monday.
  return (d.getDay() + 6) % 7;
}

export function currentWeek(days: AppState["days"]): WeekDay[] {
  const back = mondayOffset();
  const today = todayKey(0);
  return Array.from({ length: 7 }, (_, i) => {
    const key = todayKey(i - back);
    const entries = days[key]?.entries ?? [];
    return {
      date: key,
      letter: WEEKDAY_LETTERS_MON[i],
      // WEEKDAYS is Sunday-first; this week is Monday-first.
      label: `${capitalizeFirst(WEEKDAYS[(i + 1) % 7])}, ${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`,
      total: entries.reduce((sum, e) => sum + e.calories, 0),
      ...sumMacros(entries),
      isToday: key === today,
      isFuture: key > today
    };
  });
}

export interface MacroTargetSet {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

/** Midpoints of the stored ranges — a bar needs one number, not two. */
export function targetMidpoints(
  calorieTarget: AppState["calorieTarget"],
  macroTargets: AppState["macroTargets"]
): MacroTargetSet {
  const mid = (a: number | null, b: number | null) => (a != null && b != null ? (a + b) / 2 : null);
  return {
    kcal: mid(calorieTarget.min, calorieTarget.max),
    protein: mid(macroTargets.proteinMin, macroTargets.proteinMax),
    fat: mid(macroTargets.fatMin, macroTargets.fatMax),
    carbs: mid(macroTargets.carbsMin, macroTargets.carbsMax)
  };
}
