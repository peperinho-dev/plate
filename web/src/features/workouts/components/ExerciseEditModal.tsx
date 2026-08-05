// Rename an exercise and tag it with a progression group.
//
// A progression group is free text shared by variants of the same movement
// ("Flexiones de rodillas" and "Flexiones" both tagged "Flexiones"), which
// is what lets Análisis show a difficulty timeline without anyone having
// to predefine stages.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { useAppStore } from "../../../shared/store";
import type { Exercise } from "../../../shared/store/types";
import { renameExercise } from "../actions";

interface ExerciseEditModalProps {
  open: boolean;
  exercise: Exercise | null;
  dayKey: string;
  onClose: () => void;
}

export function ExerciseEditModal({ open, exercise, dayKey, onClose }: ExerciseEditModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && exercise) {
      setName(exercise.name);
      setGroup(exercise.progressionGroup ?? "");
    }
  }

  if (!exercise) return null;

  // Existing names and groups offered as datalist suggestions, so variants
  // get tagged consistently instead of by slightly different spellings.
  const allNames = new Set<string>();
  const allGroups = new Set<string>();
  Object.values(workouts).forEach((day) =>
    day.exercises.forEach((ex) => {
      allNames.add(ex.name);
      if (ex.progressionGroup) allGroups.add(ex.progressionGroup);
    })
  );

  return (
    <Modal open={open} title="Editar ejercicio" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>Nombre</span>
          <input type="text" list="exerciseNameList" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <datalist id="exerciseNameList">
          {Array.from(allNames).sort().map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <label className="field">
          <span>Grupo de progresión (opcional)</span>
          <input
            type="text"
            list="progressionGroupList"
            placeholder="p. ej. Flexiones"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
        </label>
        <datalist id="progressionGroupList">
          {Array.from(allGroups).sort().map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <p className="modal-hint">
          Agrupa variantes del mismo ejercicio para ver tu progresión entre ellas en Análisis.
        </p>

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              showToast("Indica un nombre");
              return;
            }
            renameExercise(dayKey, exercise.id, trimmed, group.trim() || null);
            showToast("Guardado");
            onClose();
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}
