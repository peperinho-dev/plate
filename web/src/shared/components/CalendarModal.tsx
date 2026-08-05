// Month calendar for jumping to any day (past or future) and for picking a
// paste destination. Ported from the calendarModal in app.js — each cell
// carries dots for "trained that day" and "hit the calorie range".
import { useState } from "react";
import { Modal } from "./Modal";
import { showToast } from "./Toast";
import { useAppStore } from "../store";
import { useUiStore } from "../store/ui";
import { formatDateKey, todayKey, dateOffsetFromToday, parseDateKey } from "../lib/date";
import { MONTHS_FULL } from "../lib/format";
import { dayHitCalorieGoal, hasWorkoutSession } from "../lib/nutrition";
import { ChevronLeft, ChevronRight } from "./Icons";
import { pasteEntriesToDay } from "../../features/nutrition/actions";

export function CalendarModal() {
  const activeModal = useUiStore((s) => s.activeModal);
  const calendarMode = useUiStore((s) => s.calendarMode);
  const closeModal = useUiStore((s) => s.closeModal);
  const dayOffset = useUiStore((s) => s.dayOffset);
  const setDayOffset = useUiStore((s) => s.setDayOffset);
  const clipboard = useUiStore((s) => s.clipboard);
  // Per-slice selectors, not the whole store — see lib/nutrition.ts.
  const loggedDays = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const calorieTarget = useAppStore((s) => s.calorieTarget);

  const open = activeModal === "calendar";

  const seedCursor = () => {
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  };

  // Which month the grid is showing. The component stays mounted while
  // closed so AnimatePresence can play its exit, so the cursor is reseeded
  // on the closed->open transition instead of on mount — React's
  // adjust-state-during-render pattern, no effect needed.
  const [cursor, setCursor] = useState(seedCursor);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setCursor(seedCursor());
  }

  const handlePick = (key: string) => {
    if (calendarMode === "paste") {
      if (clipboard) pasteEntriesToDay(clipboard.entries, key, "keep");
      closeModal();
      showToast("Pegado");
      return;
    }
    setDayOffset(dateOffsetFromToday(parseDateKey(key)));
    closeModal();
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDow = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(year, month, 1 - startDow);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((startDow + daysInMonth) / 7);

  const todayKeyStr = todayKey(0);
  const selectedKeyStr = todayKey(dayOffset);

  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Modal open={open} title="Calendario" onClose={closeModal}>
      <div className="calendar-nav">
        <button
          type="button"
          className="icon-btn"
          aria-label="Mes anterior"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronLeft />
        </button>
        <span className="calendar-month-label">
          {MONTHS_FULL[month]} {year}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Mes siguiente"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <ChevronRight />
        </button>
      </div>

      <div className="calendar-weekdays">
        <span>L</span>
        <span>M</span>
        <span>X</span>
        <span>J</span>
        <span>V</span>
        <span>S</span>
        <span>D</span>
      </div>

      <div className="calendar-grid">
        {cells.map((d) => {
          const key = formatDateKey(d);
          const className =
            "calendar-day" +
            (d.getMonth() !== month ? " is-outside" : "") +
            (key === todayKeyStr ? " is-today" : "") +
            (key === selectedKeyStr ? " is-selected" : "");
          return (
            <button key={key} type="button" className={className} onClick={() => handlePick(key)}>
              <span className="calendar-day-num">{d.getDate()}</span>
              <span className="calendar-day-dots">
                {hasWorkoutSession(workouts, key) && <span className="calendar-dot calendar-dot--workout" />}
                {dayHitCalorieGoal(loggedDays, calorieTarget, key) && (
                  <span className="calendar-dot calendar-dot--goal" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span className="calendar-legend-item">
          <span className="calendar-dot calendar-dot--workout" />
          Entreno
        </span>
        <span className="calendar-legend-item">
          <span className="calendar-dot calendar-dot--goal" />
          Objetivo calórico
        </span>
      </div>

      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => handlePick(todayKey(0))}
      >
        Hoy
      </button>
    </Modal>
  );
}
