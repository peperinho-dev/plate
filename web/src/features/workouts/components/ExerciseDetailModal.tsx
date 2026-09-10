// Logging sets for one exercise, as a table you edit in place.
//
// The Reps/Tiempo toggle is what makes this work for calisthenics: a
// plank is logged as a duration, a pull-up as reps, and the same table
// handles both. It sets what a *new* set records; existing rows keep
// whatever they were logged as.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { useAppStore } from "../../../shared/store";
import type { Exercise } from "../../../shared/store/types";
import { formatShortDate } from "../../../shared/lib/format";
import {
  findExercisePR,
  findLastExerciseSets,
  formatDuration,
  formatSet,
  isHoldSet
} from "../../../shared/lib/workouts";
import { addSet } from "../actions";
import { SetTable } from "./SetTable";
import { useRestTimer } from "../useRestTimer";

interface ExerciseDetailModalProps {
  open: boolean;
  exercise: Exercise | null;
  dayKey: string;
  onClose: () => void;
  onEditExercise: () => void;
}

// 15-second steps, as article 303 describes, rather than three fixed
// buttons — rest that has to be 45, 60 or 90 is rest you round to fit the
// app.
const REST_PRESETS = [30, 45, 60, 90, 120, 180];

export function ExerciseDetailModal({
  open,
  exercise,
  dayKey,
  onClose,
  onEditExercise
}: ExerciseDetailModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const restSeconds = useAppStore((s) => s.workoutGoal.restSeconds);

  const [mode, setMode] = useState<"reps" | "hold">("reps");

  const rest = useRestTimer();

  // Re-seed on open: default the mode to whatever the last set used, so
  // logging a second plank doesn't need the toggle flipped every time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const last = exercise?.sets[exercise.sets.length - 1];
      setMode(last && isHoldSet(last) ? "hold" : "reps");
      rest.stop();
    }
  }

  if (!exercise) return null;

  const lastPerf = findLastExerciseSets(workouts, exercise.name, dayKey);
  const pr = findExercisePR(workouts, exercise.name);
  // Whatever occupied this slot last session — index N of the previous
  // session lines up with the set about to be added.
  const suggestion = lastPerf?.ex.sets[exercise.sets.length] ?? null;

  // A new set starts from what you did in this slot last session, and
  // failing that from the row above it. Either way the common case —
  // three sets at the same weight — is three taps, not three re-entries.
  const handleAddSet = () => {
    const seed = suggestion ?? exercise.sets[exercise.sets.length - 1] ?? null;
    const hold = seed ? isHoldSet(seed) : mode === "hold";
    addSet(dayKey, exercise.id, {
      weightKg: seed?.weightKg ?? null,
      reps: hold ? null : (seed?.reps ?? null),
      holdSeconds: hold ? (seed?.holdSeconds ?? null) : null,
      type: "normal"
    });
    rest.start(restSeconds || 90);
  };

  return (
    <Modal open={open} title={exercise.name} onClose={onClose}>
      {lastPerf && (
        <p className="modal-hint">
          Última vez ({formatShortDate(lastPerf.dayKey)}): {lastPerf.ex.sets.map(formatSet).join(", ")}
        </p>
      )}
      {pr && <p className="modal-hint modal-hint--pr">Mejor marca: {formatSet(pr)}</p>}

      <div className="set-mode">
        <div className="segmented segmented--compact">
          <button
            type="button"
            className={"segmented-btn" + (mode === "reps" ? " active" : "")}
            onClick={() => setMode("reps")}
          >
            Reps
          </button>
          <button
            type="button"
            className={"segmented-btn" + (mode === "hold" ? " active" : "")}
            onClick={() => setMode("hold")}
          >
            Tiempo
          </button>
        </div>
      </div>

      <SetTable
        exercise={exercise}
        dayKey={dayKey}
        previous={lastPerf?.ex.sets ?? null}
        mode={mode}
        onAddSet={handleAddSet}
      />

      {rest.isRunning && (
        <div className="rest-timer">
          <div className="rest-timer-info">
            <span className="rest-timer-label">Descanso</span>
            <span className="rest-timer-time">{formatDuration(rest.remaining ?? 0)}</span>
          </div>
          <div className="rest-timer-actions">
            {/* Nudging the running timer, from article 310 — adjusting rest
                mid-set shouldn't mean restarting it. */}
            <button
              type="button"
              className="rest-timer-preset"
              aria-label="Quitar 10 segundos"
              onClick={() => rest.adjust(-10)}
            >
              −10
            </button>
            <button
              type="button"
              className="rest-timer-preset"
              aria-label="Añadir 10 segundos"
              onClick={() => rest.adjust(10)}
            >
              +10
            </button>
            {REST_PRESETS.map((secs) => (
              <button
                key={secs}
                type="button"
                className={"rest-timer-preset" + (secs === restSeconds ? " active" : "")}
                onClick={() => rest.start(secs)}
              >
                {secs}s
              </button>
            ))}
            <button type="button" className="rest-timer-skip" onClick={rest.stop}>
              Saltar
            </button>
          </div>
        </div>
      )}

      <button type="button" className="link-btn link-btn--muted" onClick={onEditExercise}>
        Editar ejercicio
      </button>
    </Modal>
  );
}
