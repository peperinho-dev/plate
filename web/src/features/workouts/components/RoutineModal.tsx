// Builds a named routine — an ordered list of exercise names — ported
// from #routineModal in app.js.
//
// Replaces a window.prompt that could only capture a name, which meant
// "save today's session" was the only way a routine could ever be
// created. This lets one be written from scratch, and edited before
// saving.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { XIcon } from "../../../shared/components/Icons";
import { saveRoutine } from "../actions";
import { movementFromName, nextInChain } from "../../../shared/lib/bodyweight";
import type { Routine } from "../../../shared/store/types";

interface RoutineModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the exercise list, e.g. from "guardar el día de hoy". */
  initialExercises?: string[];
  /** Set to edit an existing routine in place instead of creating one. */
  routine?: Routine | null;
  nameOptions: string[];
}

export function RoutineModal({
  open,
  onClose,
  initialExercises,
  routine,
  nameOptions
}: RoutineModalProps) {
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);
  const [rests, setRests] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  const [lastId, setLastId] = useState(routine?.id ?? null);
  if (open !== wasOpen || (routine?.id ?? null) !== lastId) {
    setWasOpen(open);
    setLastId(routine?.id ?? null);
    if (open) {
      setName(routine?.name ?? "");
      setExercises(routine?.exerciseNames ?? initialExercises ?? []);
      setRests(routine?.restByExercise ?? {});
      setDraft("");
    }
  }

  // Swapping one exercise for the next rung of its own chain, in place.
  // This is the edit a progression actually needs — the routine is the
  // same routine, one step harder — and doing it by hand meant deleting
  // and rebuilding the whole thing. The rest travels with it, since the
  // gap after a harder variant of the same movement is the same gap.
  const promote = (index: number) => {
    setExercises((prev) => {
      const current = movementFromName(prev[index]);
      const next = current && nextInChain(current);
      if (!next) return prev;
      setRests((r) => {
        const carried = r[prev[index]];
        if (carried == null) return r;
        const { [prev[index]]: _removed, ...rest } = r;
        return { ...rest, [next.name]: carried };
      });
      return prev.map((n, i) => (i === index ? next.name : n));
    });
  };

  const addExerciseName = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setExercises((prev) => [...prev, trimmed]);
    setDraft("");
  };

  return (
    <Modal open={open} title={routine ? "Editar rutina" : "Nueva rutina"} onClose={onClose}>
      <label className="field">
        <span>Nombre de la rutina</span>
        <input
          type="text"
          placeholder="p. ej. Empuje"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>

      <span className="field-group-label">Ejercicios</span>
      {exercises.length > 0 ? (
        <div className="log-list">
          {exercises.map((ex, i) => {
            const movement = movementFromName(ex);
            const next = movement ? nextInChain(movement) : null;
            return (
              <div className="row" key={`${ex}-${i}`}>
                <div className="row-main">
                  <span className="row-name">{ex}</span>
                  {rests[ex] != null && (
                    <span className="row-qty">descanso {rests[ex]}s</span>
                  )}
                </div>
                {next && (
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    title={`Cambiar por ${next.name}`}
                    onClick={() => promote(i)}
                  >
                    → {next.name}
                  </button>
                )}
                <button
                  className="row-del"
                  aria-label="Quitar"
                  onClick={() => setExercises((prev) => prev.filter((_, j) => j !== i))}
                >
                  <XIcon />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state empty-state--inline">Añade al menos un ejercicio.</p>
      )}

      <div className="form">
        <div className="field-row">
          <label className="field">
            <span>Ejercicio</span>
            <input
              type="text"
              placeholder="p. ej. Sentadilla"
              list="exerciseNameList"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds another rather than submitting — building a
                // routine is a run of several entries in a row.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExerciseName();
                }
              }}
            />
            <datalist id="exerciseNameList">
              {nameOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="btn btn--secondary btn--icon-only"
            aria-label="Añadir ejercicio"
            onClick={addExerciseName}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            if (!name.trim()) {
              showToast("Indica el nombre de la rutina");
              return;
            }
            if (exercises.length === 0) {
              showToast("Añade al menos un ejercicio");
              return;
            }
            // Only the rests still attached to an exercise that survived
            // the edit; a removed one leaves no orphan behind.
            const kept = Object.fromEntries(
              exercises.filter((ex) => rests[ex] != null).map((ex) => [ex, rests[ex]])
            );
            saveRoutine(
              name.trim(),
              exercises,
              Object.keys(kept).length > 0 ? kept : undefined,
              routine?.id
            );
            showToast(routine ? "Rutina actualizada" : "Rutina guardada");
            onClose();
          }}
        >
          Guardar rutina
        </button>
      </div>
    </Modal>
  );
}
