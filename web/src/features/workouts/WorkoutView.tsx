// The Entreno tab. Shares dayOffset with Nutrición, so switching tabs
// keeps the same day in view.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { capitalizeFirst, formatDateLabel } from "../../shared/lib/format";
import {
  computeFrequentExercises,
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
import { addExercise, removeExercise } from "./actions";

export function WorkoutView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const workouts = useAppStore((s) => s.workouts);

  const dayKey = todayKey(dayOffset);
  const exercises = workouts[dayKey]?.exercises ?? [];
  const label = formatDateLabel(dayOffset);
  const totals = computeWorkoutDayTotals(exercises);
  const sessions = countWorkoutSessions(workouts);
  const frequent = computeFrequentExercises(workouts);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // The picker rows are noise once you're mid-session, so they stay behind
  // one toggle rather than always being on screen.
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const detailExercise = exercises.find((e) => e.id === detailId) ?? null;

  const createExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addExercise(dayKey, trimmed);
    setNewName("");
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
          </div>

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
                <span className="totals-label">
                  {totals.sets} {totals.sets === 1 ? "serie" : "series"}
                </span>
              </div>
              <p className="stat-note">{totalsNote}</p>
            </div>
          )}
        </div>

        <div className="card">
          <button
            type="button"
            className="link-btn"
            onClick={() => setAddOpen((v) => !v)}
            style={{ fontWeight: 700 }}
          >
            {addOpen ? "Listo" : "+ Añadir"}
          </button>

          {addOpen && (
            <>
              <form
                className="form"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  createExercise(newName);
                }}
              >
                <label className="field">
                  <span>Ejercicio</span>
                  <input
                    type="text"
                    placeholder="p. ej. Dominadas"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn--primary btn--block" disabled={!newName.trim()}>
                  Añadir
                </button>
              </form>

              {frequent.length > 0 && (
                <div className="quick-section">
                  <div className="quick-label">Ejercicios recientes</div>
                  <div className="quick-row">
                    {frequent.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        className="quick-chip"
                        onClick={() => createExercise(f.name)}
                      >
                        <span className="quick-chip-name">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

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
      <CalendarModal />
    </div>
  );
}
