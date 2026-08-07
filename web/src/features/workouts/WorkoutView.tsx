// The Entreno tab. Shares dayOffset with Nutrición, so switching tabs
// keeps the same day in view.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { capitalizeFirst, formatDateLabel } from "../../shared/lib/format";
import {
  computeWorkoutDayTotals,
  countWorkoutSessions,
  formatDuration,
  summarizeExercise
} from "../../shared/lib/workouts";
import { WeekStrip } from "../../shared/components/WeekStrip";
import { CalendarModal } from "../../shared/components/CalendarModal";
import { SwipeToDelete } from "../../shared/components/SwipeToDelete";
import { showToast } from "../../shared/components/Toast";
import { ChevronLeft, ChevronRight, DumbbellIcon, XIcon } from "../../shared/components/Icons";
import type { TimerLog } from "../../shared/store/types";
import { ExerciseDetailModal } from "./components/ExerciseDetailModal";
import { ExerciseEditModal } from "./components/ExerciseEditModal";
import { AddWorkoutModal } from "./components/AddWorkoutModal";
import { TimerRunModal } from "./components/TimerRunModal";
import { useTimerRun } from "./useTimerRun";
import {
  addExercise,
  copyWorkoutToDay,
  logTimerRun,
  removeExercise,
  removeTimerLog
} from "./actions";

function TimerLogRows({ logs, dayKey }: { logs: TimerLog[]; dayKey: string }) {
  return (
    <div className="log-list">
      {logs.map((log) => (
        <div className="row" key={log.id}>
          <div className="row-main">
            <span className="row-name">{log.name}</span>
            <span className="row-qty">{formatDuration(log.totalSeconds)}</span>
          </div>
          <button className="row-del" aria-label="Quitar" onClick={() => removeTimerLog(dayKey, log.id)}>
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

export function WorkoutView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const clipboard = useUiStore((s) => s.clipboard);
  const setClipboard = useUiStore((s) => s.setClipboard);
  const workouts = useAppStore((s) => s.workouts);

  const dayKey = todayKey(dayOffset);
  const exercises = workouts[dayKey]?.exercises ?? [];
  const label = formatDateLabel(dayOffset);
  const totals = computeWorkoutDayTotals(exercises);
  const sessions = countWorkoutSessions(workouts);

  const timerLogs = workouts[dayKey]?.timerLogs ?? [];
  const warmupLogs = timerLogs.filter((l) => l.category === "warmup");
  const stretchLogs = timerLogs.filter((l) => l.category === "stretch");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const detailExercise = exercises.find((e) => e.id === detailId) ?? null;

  // Logged only on natural completion — stopping early never happened.
  const run = useTimerRun((timer) => logTimerRun(dayKey, timer));

  // The sheet stays open so several exercises can go in at once; the set
  // logger opens when you tap the row back on the day card.
  const createExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addExercise(dayKey, trimmed);
    showToast(`${trimmed} añadido`);
  };

  const totalsNote =
    totals.volume > 0
      ? `${Math.round(totals.volume)} kg de volumen total`
      : totals.reps > 0 && totals.holdSeconds > 0
        ? `${totals.reps} reps · ${formatDuration(totals.holdSeconds)}`
        : totals.holdSeconds > 0
          ? `${formatDuration(totals.holdSeconds)} en total`
          : `${totals.reps} reps totales`;

  const isEmpty = exercises.length === 0 && timerLogs.length === 0;

  return (
    <div className="view">
      <header className="topbar">
        <div className="day-nav">
          <button className="icon-btn" aria-label="Día anterior" onClick={() => shiftDay(-1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="day-label" onClick={() => openCalendar("navigate")}>
            {label.short}
          </button>
          <button className="icon-btn" aria-label="Día siguiente" onClick={() => shiftDay(1)}>
            <ChevronRight />
          </button>
        </div>
        <span className="chip">
          {sessions} {sessions === 1 ? "sesión" : "sesiones"}
        </span>
      </header>

      <WeekStrip />

      <main className="content">
        <div className="card">
          <div className="card-date-row">
            <div className="card-date">
              {capitalizeFirst(`${label.weekday}, ${label.day} de ${label.month}`)}
            </div>
            <div className="card-date-actions">
              {exercises.length > 0 && (
                <button
                  type="button"
                  className="link-btn link-btn--muted"
                  onClick={() => {
                    setClipboard({
                      type: "workout",
                      exercises: exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s })) }))
                    });
                    showToast("Entreno copiado. Ve a otro día y pulsa Pegar.");
                  }}
                >
                  Copiar
                </button>
              )}
              {clipboard?.type === "workout" && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    copyWorkoutToDay(clipboard.exercises, dayKey);
                    showToast("Pegado");
                  }}
                >
                  Pegar
                </button>
              )}
            </div>
          </div>

          {isEmpty ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <DumbbellIcon size={34} />
              </div>
              <p>Sin ejercicios todavía.</p>
            </div>
          ) : (
            <>
              {/* Same order the session runs in, and the same order the
                  Añadir sheet lists them: warm up, work, stretch. Each
                  block appears only if it actually happened. */}
              {warmupLogs.length > 0 && (
                <div className="workout-block">
                  <span className="workout-block-label">Calentamiento</span>
                  <TimerLogRows logs={warmupLogs} dayKey={dayKey} />
                </div>
              )}

              {exercises.length > 0 && (
                <div className="workout-block">
                  <span className="workout-block-label">Series</span>
                  <div className="log-list">
                    {exercises.map((ex) => (
                      <SwipeToDelete
                        key={ex.id}
                        onDelete={() => {
                          removeExercise(dayKey, ex.id);
                          showToast("Ejercicio quitado");
                        }}
                      >
                        <div className="row">
                          <button type="button" className="row-main" onClick={() => setDetailId(ex.id)}>
                            <span className="row-name">{ex.name}</span>
                            <span className="row-qty">{summarizeExercise(ex)}</span>
                          </button>
                          <button
                            className="row-del"
                            aria-label="Quitar"
                            onClick={() => removeExercise(dayKey, ex.id)}
                          >
                            <XIcon />
                          </button>
                        </div>
                      </SwipeToDelete>
                    ))}
                  </div>
                </div>
              )}

              {stretchLogs.length > 0 && (
                <div className="workout-block">
                  <span className="workout-block-label">Estiramientos</span>
                  <TimerLogRows logs={stretchLogs} dayKey={dayKey} />
                </div>
              )}
            </>
          )}

          {totals.sets > 0 && (
            <div className="totals">
              <div className="totals-row">
                <span className="totals-label">Total</span>
                <span className="totals-value">
                  {totals.sets} {totals.sets === 1 ? "serie" : "series"}
                </span>
              </div>
              <p className="stat-note">{totalsNote}</p>
            </div>
          )}
        </div>
      </main>

      <div className="action-bar">
        <button type="button" className="btn btn--primary btn--block" onClick={() => setAddOpen(true)}>
          <span className="btn-icon">+</span> Añadir
        </button>
      </div>

      <AddWorkoutModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        dayKey={dayKey}
        exercises={exercises}
        onAddExercise={createExercise}
        onRunTimer={(timer) => {
          setAddOpen(false);
          run.start(timer);
        }}
      />

      <ExerciseDetailModal
        open={!!detailExercise}
        exercise={detailExercise}
        dayKey={dayKey}
        onClose={() => setDetailId(null)}
        onEditExercise={() => setEditOpen(true)}
      />
      <ExerciseEditModal
        open={editOpen}
        exercise={detailExercise}
        dayKey={dayKey}
        onClose={() => setEditOpen(false)}
      />
      <TimerRunModal run={run} />
      <CalendarModal />
    </div>
  );
}
