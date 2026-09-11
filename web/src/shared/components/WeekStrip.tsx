// The Mon–Sun week containing the selected day. Shared by the Nutrición
// and Entreno tabs (both drive the same dayOffset), ported from
// getWeekStripDays()/renderWeekStripInto() in app.js.
import { useAppStore } from "../store";
import { useUiStore } from "../store/ui";
import { DAY_MS, formatDateKey } from "../lib/date";
import { WEEKDAY_LETTERS_MON } from "../lib/format";
import { dayCalorieTotal, hasWorkoutSession } from "../lib/nutrition";

interface StripDay {
  date: Date;
  offset: number;
  isFuture: boolean;
  isSelected: boolean;
}

// Each day is tagged with its own offset-from-today so a tap can jump
// straight to it.
function getWeekStripDays(offset: number): StripDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(today);
  selected.setDate(selected.getDate() + offset);
  const dow = selected.getDay(); // 0=Sun..6=Sat
  const mondayDelta = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(selected);
  monday.setDate(monday.getDate() + mondayDelta);

  const days: StripDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dOffset = Math.round((d.getTime() - today.getTime()) / DAY_MS);
    days.push({ date: d, offset: dOffset, isFuture: dOffset > 0, isSelected: dOffset === offset });
  }
  return days;
}

/**
 * The outline that fills around a day as its calories climb.
 *
 * Drawn as a rounded rect at 0–100 in both axes and stretched to the chip
 * with preserveAspectRatio="none", so it always traces the real border
 * radius whatever width the strip happens to give each day. The stroke is
 * non-scaling, or that same stretch would make the vertical edges thinner
 * than the horizontal ones.
 *
 * Progress runs to the *bottom* of the calorie range, not the middle:
 * reaching the range is the thing being aimed at, so that is where the
 * ring closes. Past the top of the range it re-draws in the fat/over
 * colour — a closed ring reading "done" would be the wrong signal for a
 * day you overshot.
 */
function DayRing({ progress, over }: { progress: number; over: boolean }) {
  // Perimeter of the rounded rect below, near enough for a dash pattern.
  const LEN = 400;
  return (
    <svg className="week-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect
        className={"week-ring-path" + (over ? " is-over" : "")}
        x="1.5" y="1.5" width="97" height="97" rx="14" ry="14"
        pathLength={LEN}
        strokeDasharray={LEN}
        strokeDashoffset={LEN * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
}

export function WeekStrip() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const setDayOffset = useUiStore((s) => s.setDayOffset);
  // Per-slice selectors, not the whole store — see lib/nutrition.ts.
  const loggedDays = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const days = getWeekStripDays(dayOffset);

  return (
    <div className="week-strip">
      {days.map((d) => {
        const key = formatDateKey(d.date);
        const exercised = hasWorkoutSession(workouts, key);
        const total = dayCalorieTotal(loggedDays, key);
        const floor = calorieTarget.min || 0;
        // A day with nothing logged draws no ring at all, rather than an
        // empty one — a future Saturday shouldn't look like a failure.
        const progress = floor > 0 && total > 0 ? total / floor : 0;
        const over = !!(calorieTarget.max && total > calorieTarget.max);
        const className =
          "week-strip-day" + (d.isSelected ? " is-selected" : "") + (d.isFuture ? " is-future" : "");
        return (
          <button key={key} type="button" className={className} onClick={() => setDayOffset(d.offset)}>
            {progress > 0 && <DayRing progress={progress} over={over} />}
            <span className="week-strip-letter">{WEEKDAY_LETTERS_MON[(d.date.getDay() + 6) % 7]}</span>
            <span className="week-strip-num">{d.date.getDate()}</span>
            <span className="week-strip-dots">
              {/* The calorie dot is gone: the ring says the same thing with
                  more resolution. The training dot stays — it is a
                  different fact and the ring cannot carry it. */}
              {exercised && <span className="week-strip-dot week-strip-dot--workout" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
