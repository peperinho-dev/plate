// Renames a logged meal and adjusts the time it was eaten — ported from
// #renameGroupModal.
//
// This only ever edits the logged entry, never the recipe it came from.
// Fixing today's label shouldn't quietly rewrite the template; pushing
// changes back to the recipe is the separate, explicit "Actualizar
// receta" action on the row.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import type { Entry } from "../../../shared/store/types";

interface RenameGroupModalProps {
  open: boolean;
  entry: Entry | null;
  onClose: () => void;
  onSave: (name: string, time: string) => void;
}

function timeValue(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function RenameGroupModal({ open, entry, onClose, onSave }: RenameGroupModalProps) {
  const [name, setName] = useState("");
  const [time, setTime] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && entry) {
      setName(entry.name);
      setTime(timeValue(entry.addedAt));
    }
  }

  return (
    <Modal open={open} title="Editar comida" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            showToast("Indica un nombre");
            return;
          }
          onSave(trimmed, time);
        }}
      >
        <label className="field">
          <span>Nombre</span>
          <input
            type="text"
            placeholder="p. ej. Desayuno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Hora</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()}>
          Guardar
        </button>
      </form>
    </Modal>
  );
}
