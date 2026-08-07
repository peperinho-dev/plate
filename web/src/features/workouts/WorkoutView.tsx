// The Entreno tab. Shares dayOffset with Nutrición, so switching tabs
// keeps the same day in view.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { capitalizeFirst, formatDateLabel } from "../../shared/lib/format";
import {
  collectAllExerciseNames,
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
import { ExerciseDetailModal } from "./components/ExerciseDetailModal";
import { ExerciseEditModal } from "./components/ExerciseEditModal";
import { AddExerciseModal } from "./components/AddExerciseModal";
import { TimerSection } from "./components/TimerSection";
import { TimerRunModal } from "./components/TimerRunModal";
import { RoutineModal } from "./components/RoutineModal";
import { useTimerRun } from "./useTimerRun";
import {
  addExercise,
  copyWorkoutToDay,
  removeExercise,
  logTimerRun,
  removeRoutine,
  removeTimerLog,
  startRoutine
} from "./actions";

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
  const allNames = collectAllExerciseNames(workouts);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [routinesEditing, setRoutinesEditing] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  // Seeds the builder with today's session for "Guardar día"; empty for
  // a routine written from scratch.
  const [routineSeed, setRoutineSeed] = useState<string[]>([]);
  const routines = useAppStore((s) => s.routines);

  const detailExercise = exercises.find((e) => e.id === detailId) ?? null;
  const timerLogs = workouts[dayKey]?.timerLogs ?? [];

  // Logged only on natural completion — stopping early never happened.
  const run = useTimerRun((timer) => logTimerRun(dayKey, timer));

  const createExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addExercise(dayKey, trimmed);
    setAddOpen(false);
    setDetailId(id);
  };

  const totalsNote =
    totals.volume > 0
      ? `${Math.round(totals.volume)} kg de volumen total`
      : totals.reps > 0 && totals.holdSeconds > 0
        ? `${totals.reps} reps · ${formatDuration(totals.holdSeconds)}`
        : totals.holdSeconds > 0
          ? `${formatDuration(totals.holdSeconds)} en total`
          : `${totals.reps} reps totales`;

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

          {timerLogs.length > 0 && (
            <div className="log-list">
              {timerLogs.map((log) => (
                <div className="row" key={log.id}>
                  <div className="row-main">
                    <span className="row-name">{log.name}</span>
                    <span className="row-qty">
                      {log.category === "warmup" ? "Calentamiento" : "Estiramiento"} ·{" "}
                      {formatDuration(log.totalSeconds)}
                    </span>
                  </div>
                  <button
                    className="row-del"
                    aria-label="Quitar"
                    onClick={() => removeTimerLog(dayKey, log.id)}
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {exercises.length > 0 ? (
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
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <DumbbellIcon size={34} />
              </div>
              <p>Sin ejercicios todavía.</p>
            </div>
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

        {/* Calentamiento/rutinas/estiramientos are their own card, separate
            from adding an exercise — bolting them onto that flow made a
            simple "add one thing" action into a wall of unrelated
            controls. */}
        <div className="card">
          <TimerSection category="warmup" label="Calentamiento" onRun={run.start} />

          <div className="quick-section">
            <div className="quick-label-row">
              <div className="quick-label">Rutinas</div>
              <div className="quick-label-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setRoutineSeed(exercises.map((e) => e.name));
                    setRoutineOpen(true);
                  }}
                >
                  {exercises.length > 0 ? "+ Guardar día" : "+ Nueva"}
                </button>
                {routines.length > 0 && (
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    onClick={() => setRoutinesEditing((v) => !v)}
                  >
                    {routinesEditing ? "Listo" : "Editar"}
                  </button>
                )}
              </div>
            </div>
            {routines.length > 0 ? (
              <div className="quick-row">
                {routines.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="quick-chip"
                    onClick={() => {
                      if (routinesEditing) {
                        removeRoutine(r.id);
                        return;
                      }
                      startRoutine(dayKey, r.exerciseNames);
                      showToast(`${r.name} añadida`);
                    }}
                  >
                    <span className="quick-chip-name">{r.name}</span>
                    <span className="quick-chip-kcal">{r.exerciseNames.length} ej.</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="stat-note">Guarda el día de hoy para reutilizarlo más tarde.</p>
            )}
          </div>

          <TimerSection category="stretch" label="Estiramientos" onRun={run.start} />
        </div>
      </main>

      <div className="action-bar">
        <button type="button" className="btn btn--primary btn--block" onClick={() => setAddOpen(true)}>
          <span className="btn-icon">+</span> Añadir ejercicio
        </button>
      </div>

      <AddExerciseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={createExercise}
        nameOptions={allNames}
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
      <RoutineModal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        initialExercises={routineSeed}
        nameOptions={allNames}
      />
      <TimerRunModal run={run} />
      <CalendarModal />
    </div>
  );
}
