// Logging sets for one exercise. The Reps/Tiempo toggle is what makes this
// work for calisthenics: a plank is logged as a duration, a pull-up as
// reps, and the same form handles both.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { XIcon } from "../../../shared/components/Icons";
import { useAppStore } from "../../../shared/store";
import type { Exercise, SetType } from "../../../shared/store/types";
import { formatShortDate } from "../../../shared/lib/format";
import {
  findExercisePR,
  findLastExerciseSets,
  formatDuration,
  formatSet,
  isHoldSet
} from "../../../shared/lib/workouts";
import { addSet, removeSet, updateSet } from "../actions";
import { useRestTimer } from "../useRestTimer";

interface ExerciseDetailModalProps {
  open: boolean;
  exercise: Exercise | null;
  dayKey: string;
  onClose: () => void;
  onEditExercise: () => void;
}

const SET_TYPE_LABELS: Record<Exclude<SetType, "normal">, string> = {
  warmup: "Calent.",
  failure: "Fallo",
  dropset: "Drop"
};
const SET_TYPES: SetType[] = ["normal", "warmup", "failure", "dropset"];
const REST_PRESETS = [45, 60, 90];

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
  const [setType, setSetType] = useState<SetType>("normal");
  const [weight, setWeight] = useState("");
  const [amount, setAmount] = useState(""); // reps, or seconds in hold mode
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const rest = useRestTimer();

  // Re-seed on open: default the mode to whatever the last set used, so
  // logging a second plank doesn't need the toggle flipped every time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const last = exercise?.sets[exercise.sets.length - 1];
      setMode(last && isHoldSet(last) ? "hold" : "reps");
      setSetType("normal");
      setWeight("");
      setAmount("");
      setEditingSetId(null);
      rest.stop();
    }
  }

  if (!exercise) return null;

  const lastPerf = findLastExerciseSets(workouts, exercise.name, dayKey);
  const pr = findExercisePR(workouts, exercise.name);
  // Whatever occupied this slot last session — index N of the previous
  // session lines up with the set about to be added.
  const suggestion = lastPerf?.ex.sets[exercise.sets.length] ?? null;

  const resetForm = () => {
    setEditingSetId(null);
    setWeight("");
    setAmount("");
    setSetType("normal");
  };

  const handleSubmit = () => {
    const value = parseInt(amount, 10);
    if (!(value > 0)) return;
    const w = weight.trim() === "" ? null : parseFloat(weight);
    if (w !== null && !(w >= 0)) return;

    const input = {
      weightKg: w,
      reps: mode === "hold" ? null : value,
      holdSeconds: mode === "hold" ? value : null,
      type: setType
    };

    if (editingSetId) {
      updateSet(dayKey, exercise.id, editingSetId, input);
      resetForm();
    } else {
      addSet(dayKey, exercise.id, input);
      rest.start(restSeconds || 90);
      // Deliberately keeps weight/amount filled — logging three identical
      // sets should be three taps, not three re-entries.
      setEditingSetId(null);
    }
  };

  return (
    <Modal open={open} title={exercise.name} onClose={onClose}>
      {lastPerf && (
        <p className="modal-hint">
          Última vez ({formatShortDate(lastPerf.dayKey)}): {lastPerf.ex.sets.map(formatSet).join(", ")}
        </p>
      )}
      {pr && <p className="modal-hint modal-hint--pr">Mejor marca: {formatSet(pr)}</p>}

      <div className="log-list">
        {exercise.sets.map((s, i) => (
          <div className="row" key={s.id}>
            <button
              type="button"
              className="row-main"
              onClick={() => {
                setEditingSetId(s.id);
                setMode(isHoldSet(s) ? "hold" : "reps");
                setWeight(s.weightKg !== null && s.weightKg !== undefined ? String(s.weightKg) : "");
                setAmount(String(isHoldSet(s) ? s.holdSeconds : s.reps));
                setSetType(s.type || "normal");
              }}
            >
              <span className="row-name-line">
                <span className="row-name">Serie {i + 1}</span>
                {s.type && s.type !== "normal" && (
                  <span className={`set-type-tag set-type-tag--${s.type}`}>
                    {SET_TYPE_LABELS[s.type as Exclude<SetType, "normal">]}
                  </span>
                )}
              </span>
              <span className="row-qty">
                {formatSet(s)}
                {/* The matching set from last session, so progressive
                    overload is visible per set rather than only in the
                    summary line at the top. */}
                {lastPerf?.ex.sets[i] && (
                  <>
                    {" · "}
                    <span className="row-prev">antes {formatSet(lastPerf.ex.sets[i])}</span>
                  </>
                )}
              </span>
            </button>
            <button className="row-del" aria-label="Quitar" onClick={() => removeSet(dayKey, exercise.id, s.id)}>
              <XIcon />
            </button>
          </div>
        ))}
      </div>
      {exercise.sets.length === 0 && <p className="empty-state">Sin series todavía.</p>}

      {/* What you did in this slot last time — the obvious thing to match
          or beat, one tap away instead of retyped. */}
      {suggestion && (
        <p className="modal-hint modal-hint--suggested">
          <span>
            Sugerido: <strong>{formatSet(suggestion)}</strong>
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              const hold = isHoldSet(suggestion);
              setMode(hold ? "hold" : "reps");
              setWeight(
                suggestion.weightKg !== null && suggestion.weightKg !== undefined
                  ? String(suggestion.weightKg)
                  : ""
              );
              setAmount(String(hold ? suggestion.holdSeconds : suggestion.reps));
            }}
          >
            Usar
          </button>
        </p>
      )}

      {rest.isRunning && (
        <div className="rest-timer">
          <div className="rest-timer-info">
            <span className="rest-timer-label">Descanso</span>
            <span className="rest-timer-time">{formatDuration(rest.remaining ?? 0)}</span>
          </div>
          <div className="rest-timer-actions">
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

      <form
        className="form form--divided"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="field">
          <span>Modo</span>
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

        <div className="field">
          <span>Tipo de serie</span>
          <div className="segmented segmented--compact">
            {SET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={"segmented-btn" + (setType === t ? " active" : "")}
                onClick={() => setSetType(t)}
              >
                {t === "normal" ? "Normal" : SET_TYPE_LABELS[t as Exclude<SetType, "normal">]}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Peso (kg) — opcional</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="peso corporal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{mode === "hold" ? "Segundos" : "Reps"}</span>
            <input
              type="number"
              min="1"
              step="any"
              inputMode="numeric"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn btn--primary btn--block">
          {editingSetId ? "Guardar cambios" : "Añadir serie"}
        </button>
      </form>

      <button type="button" className="link-btn link-btn--muted" onClick={onEditExercise}>
        Editar ejercicio
      </button>
    </Modal>
  );
}
