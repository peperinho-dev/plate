// The Mon–Sun week containing the selected day. Shared by the Nutrición
// and Entreno tabs (both drive the same dayOffset), ported from
// getWeekStripDays()/renderWeekStripInto() in app.js.
import { useAppStore } from "../store";
import { useUiStore } from "../store/ui";
import { DAY_MS, formatDateKey } from "../lib/date";
import { WEEKDAY_LETTERS_MON } from "../lib/format";
import { dayHitCalorieGoal, hasWorkoutSession } from "../lib/nutrition";

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

export function WeekStrip() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const setDayOffset = useUiStore((s) => s.setDayOffset);
  const state = useAppStore();
  const days = getWeekStripDays(dayOffset);

  return (
    <div className="week-strip">
      {days.map((d) => {
        const key = formatDateKey(d.date);
        const exercised = hasWorkoutSession(state, key);
        const goalHit = dayHitCalorieGoal(state, key);
        const className =
          "week-strip-day" + (d.isSelected ? " is-selected" : "") + (d.isFuture ? " is-future" : "");
        return (
          <button key={key} type="button" className={className} onClick={() => setDayOffset(d.offset)}>
            <span className="week-strip-letter">{WEEKDAY_LETTERS_MON[(d.date.getDay() + 6) % 7]}</span>
            <span className="week-strip-num">{d.date.getDate()}</span>
            <span className="week-strip-dots">
              {exercised && <span className="week-strip-dot week-strip-dot--workout" />}
              {goalHit && <span className="week-strip-dot week-strip-dot--goal" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
