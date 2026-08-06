// A clean, single-purpose modal — matches vanilla's #addExerciseModal
// exactly (name field + Añadir), rather than an inline panel bolted onto
// the exercise list card. Warmup/stretch timers and routines are a
// separate concern with their own card now, not squeezed in here.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";

interface AddExerciseModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
  nameOptions: string[];
}

export function AddExerciseModal({ open, onClose, onAdd, nameOptions }: AddExerciseModalProps) {
  const [name, setName] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName("");
  }

  return (
    <Modal open={open} title="Añadir ejercicio" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onAdd(trimmed);
        }}
      >
        <label className="field">
          <span>Nombre</span>
          <input
            type="text"
            required
            placeholder="p. ej. Press banca"
            list="exerciseNameList"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <datalist id="exerciseNameList">
            {nameOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()}>
          Añadir
        </button>
      </form>
    </Modal>
  );
}
