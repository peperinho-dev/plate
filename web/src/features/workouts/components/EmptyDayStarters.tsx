// What to offer on a day with nothing logged yet.
//
// Entreno used to be a dead screen on a rest day: one empty card and
// eight hundred pixels of nothing, with every way of actually starting a
// session — routines, the exercise library, the timers — hidden behind a
// modal you had to already know about. Comida never has this problem,
// because a day's food log is dense the moment you open it.
//
// So the empty day answers the two questions you actually have when you
// open the tab: what am I doing today, and what did I do last time.
import { useState } from "react";
import { useAppStore } from "../../../shared/store";
import { RoutineStartSheet } from "./RoutineStartSheet";
import { showToast } from "../../../shared/components/Toast";
import { capitalizeFirst, formatDateLabel } from "../../../shared/lib/format";
import { parseDateKey, dateOffsetFromToday } from "../../../shared/lib/date";
import { ChevronRight } from "../../../shared/components/Icons";
import { startRoutine, copyWorkoutToDay } from "../actions";
import type { Exercise, Routine, TimerLog } from "../../../shared/store/types";

interface LastSession {
  dayKey: string;
  exercises: Exercise[];
  timerLogs: TimerLog[];
  sets: number;
  routineName?: string;
}

/** The most recent day before `beforeDayKey` that has any exercise on it. */
function findLastSession(
  workouts: Record<string, { exercises: Exercise[]; timerLogs?: TimerLog[]; routineName?: string }>,
  beforeDayKey: string
): LastSession | null {
  const candidates = Object.keys(workouts)
    .filter((k) => k < beforeDayKey && (workouts[k]?.exercises?.length ?? 0) > 0)
    .sort();
  const dayKey = candidates[candidates.length - 1];
  if (!dayKey) return null;
  const day = workouts[dayKey];
  return {
    dayKey,
    exercises: day.exercises,
    timerLogs: day.timerLogs ?? [],
    routineName: day.routineName,
    sets: day.exercises.reduce((n, ex) => n + ex.sets.length, 0)
  };
}

export function EmptyDayStarters({ dayKey }: { dayKey: string }) {
  const routines = useAppStore((s) => s.routines);
  const [pendingRoutine, setPendingRoutine] = useState<Routine | null>(null);
  const workouts = useAppStore((s) => s.workouts);
  const last = findLastSession(workouts, dayKey);

  if (routines.length === 0 && !last) return null;

  return (
    <>
      <RoutineStartSheet
        routine={pendingRoutine}
        onClose={() => setPendingRoutine(null)}
        onStart={(restSeconds) => {
          if (!pendingRoutine) return;
          startRoutine(
            dayKey,
            pendingRoutine.exerciseNames,
            pendingRoutine.name,
            restSeconds,
            pendingRoutine.restByExercise
          );
          showToast(`${pendingRoutine.name} empezada`);
          setPendingRoutine(null);
        }}
      />
      {routines.length > 0 && (
        <>
          <div className="section-head">
            <span className="section-title">Rutinas</span>
          </div>
          <div className="card">
            <div className="log-list">
              {routines.map((r) => (
                <div className="row" key={r.id}>
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => setPendingRoutine(r)}
                  >
                    <span className="row-name">{r.name}</span>
                    <span className="row-qty">{r.exerciseNames.join(" · ")}</span>
                  </button>
                  <span className="row-chevron">
                    <ChevronRight />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {last && (
        <>
          <div className="section-head">
            <span className="section-title">Última sesión</span>
          </div>
          <div className="card">
            <div className="card-date-row">
              <div className="card-date">
                {capitalizeFirst(lastSessionLabel(last.dayKey))} · {last.sets}{" "}
                {last.sets === 1 ? "serie" : "series"}
              </div>
              <div className="card-date-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    copyWorkoutToDay(last.exercises, dayKey, last.timerLogs, last.routineName);
                    showToast("Sesión copiada a este día");
                  }}
                >
                  Repetir
                </button>
              </div>
            </div>
            <div className="log-list">
              {last.exercises.map((ex) => (
                <div className="row row--static" key={ex.id}>
                  <span className="row-name">{ex.name}</span>
                  <span className="row-qty">
                    {ex.sets.length} {ex.sets.length === 1 ? "serie" : "series"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// "Ayer" / "Hace 3 días" reads better than a bare date for something this
// recent, and the tab's header already speaks in those terms.
function lastSessionLabel(dayKey: string): string {
  const offset = dateOffsetFromToday(parseDateKey(dayKey));
  const label = formatDateLabel(offset);
  if (offset === 0 || offset === -1) return label.short;
  return `${label.weekday}, ${label.day} de ${label.month}`;
}
