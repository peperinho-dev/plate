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
  isHoldSet, REST_CHOICES } from "../../../shared/lib/workouts";
import { addSet, setExerciseRest } from "../actions";
import {
  clearsGate,
  gateLabel,
  movementFromName,
  nextInChain
} from "../../../shared/lib/bodyweight";
import { foldText } from "../../../shared/lib/text";
import { SetTable } from "./SetTable";
import { useRestTimer } from "../useRestTimer";

interface ExerciseDetailModalProps {
  open: boolean;
  exercise: Exercise | null;
  dayKey: string;
  onClose: () => void;
  onEditExercise: () => void;
}

export function ExerciseDetailModal({
  open,
  exercise,
  dayKey,
  onClose,
  onEditExercise
}: ExerciseDetailModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  // This exercise's own rest, seeded from the routine when the session
  // started. Falls back to the day's seed, then to the global default.
  const daySeed = useAppStore((s) => s.workouts[dayKey]?.restSeconds);
  const globalRest = useAppStore((s) => s.workoutGoal.restSeconds);
  const restFor = exercise?.restSeconds ?? daySeed ?? globalRest ?? 90;
  const [editingRest, setEditingRest] = useState(false);

  const [mode, setMode] = useState<"reps" | "hold">("reps");

  const rest = useRestTimer(() => setRestArmed(false));
  // The rest bar used to exist only while counting, so the durations sat
  // on top of a clock that had already started and tapping one restarted
  // it. Adding a set now *offers* a rest: the bar appears with a duration
  // selected and waits for Empezar, which makes picking and committing two
  // separate actions instead of one.
  const [restArmed, setRestArmed] = useState(false);

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

  // The next step in this movement's chain, and whether it is unlocked.
  // Every session ever logged under this name is checked, not just the
  // last: clearing the gate once is what earns the step.
  const progression = (() => {
    const movement = movementFromName(exercise.name);
    if (!movement) return null;
    const next = nextInChain(movement);
    if (!next) return null;
    const folded = foldText(exercise.name);
    const ready = Object.values(workouts).some((day) =>
      day.exercises.some(
        (ex) => foldText(ex.name) === folded && clearsGate(movement, ex.sets)
      )
    );
    return { next, ready, gate: gateLabel(movement) };
  })();
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
    setRestArmed(true);
  };

  return (
    <Modal open={open} title={exercise.name} onClose={onClose}>
      {lastPerf && (
        <p className="modal-hint">
          Última vez ({formatShortDate(lastPerf.dayKey)}): {lastPerf.ex.sets.map(formatSet).join(", ")}
        </p>
      )}
      {pr && <p className="modal-hint modal-hint--pr">Mejor marca: {formatSet(pr)}</p>}

      {/* Where this movement sits in its progression.
          A calisthenics log has no weight to add, so the way forward is a
          harder variant — and the question is always "when". The step
          carries its own gate, and having cleared it once is enough:
          earning a step is not something a bad session takes back. */}
      {progression && (
        <p
          className={
            "modal-hint modal-hint--next" + (progression.ready ? " is-ready" : "")
          }
        >
          {progression.ready ? "Listo para " : "Siguiente paso: "}
          <strong>{progression.next.name}</strong>
          {progression.ready
            ? progression.next.note
              ? ` — ${progression.next.note}`
              : ""
            : progression.gate
              ? ` — cuando hagas ${progression.gate}`
              : ""}
        </p>
      )}

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

      {(rest.isRunning || restArmed) && (
        <div className="rest-timer">
          <div className="rest-timer-info">
            <span className="rest-timer-label">Descanso</span>
            <span className="rest-timer-time">
              {formatDuration(rest.isRunning ? (rest.remaining ?? 0) : restFor)}
            </span>
          </div>
          <div className="rest-timer-actions">
            {!rest.isRunning && (
              <>
                {editingRest ? (
                  // Changing it changes *this exercise*, not the session:
                  // the gap after a heavy set is not the one after a plank.
                  REST_CHOICES.map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      className={"rest-timer-preset" + (secs === restFor ? " active" : "")}
                      onClick={() => {
                        setExerciseRest(dayKey, exercise.id, secs);
                        setEditingRest(false);
                      }}
                    >
                      {formatDuration(secs)}
                    </button>
                  ))
                ) : (
                  <>
                    {/* One button, not six. The duration came from the
                        routine; this only decides whether to run it now. */}
                    <button
                      type="button"
                      className="rest-timer-go"
                      onClick={() => rest.start(restFor)}
                    >
                      Descanso {formatDuration(restFor)}
                    </button>
                    <button
                      type="button"
                      className="rest-timer-preset"
                      onClick={() => setEditingRest(true)}
                    >
                      Cambiar
                    </button>
                    <button
                      type="button"
                      className="rest-timer-skip"
                      onClick={() => setRestArmed(false)}
                    >
                      Ahora no
                    </button>
                  </>
                )}
              </>
            )}
            {rest.isRunning && (
              <>
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
            <button
              type="button"
              className="rest-timer-skip"
              onClick={() => { rest.stop(); setRestArmed(false); }}
            >
              Saltar
            </button>
              </>
            )}
          </div>
        </div>
      )}

      <button type="button" className="link-btn link-btn--muted" onClick={onEditExercise}>
        Editar ejercicio
      </button>
    </Modal>
  );
}
