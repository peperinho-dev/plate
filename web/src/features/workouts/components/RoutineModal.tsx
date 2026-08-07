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

interface RoutineModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the exercise list, e.g. from "guardar el día de hoy". */
  initialExercises?: string[];
  nameOptions: string[];
}

export function RoutineModal({ open, onClose, initialExercises, nameOptions }: RoutineModalProps) {
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setExercises(initialExercises ?? []);
      setDraft("");
    }
  }

  const addExerciseName = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setExercises((prev) => [...prev, trimmed]);
    setDraft("");
  };

  return (
    <Modal open={open} title="Nueva rutina" onClose={onClose}>
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
          {exercises.map((ex, i) => (
            <div className="row" key={`${ex}-${i}`}>
              <div className="row-main">
                <span className="row-name">{ex}</span>
              </div>
              <button
                className="row-del"
                aria-label="Quitar"
                onClick={() => setExercises((prev) => prev.filter((_, j) => j !== i))}
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Añade al menos un ejercicio.</p>
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
            saveRoutine(name.trim(), exercises);
            showToast("Rutina guardada");
            onClose();
          }}
        >
          Guardar rutina
        </button>
      </div>
    </Modal>
  );
}
