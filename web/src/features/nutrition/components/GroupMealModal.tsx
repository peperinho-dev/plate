// Collapses several selected entries into one meal — ported from
// #groupMealModal in app.js.
//
// Saving it as a recipe too is checked by default: if you ate the same
// four things together once, you'll almost certainly eat them together
// again, and the recipe is what makes that one tap next time.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";

interface GroupMealModalProps {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (name: string, alsoSaveRecipe: boolean) => void;
}

export function GroupMealModal({ open, count, onClose, onConfirm }: GroupMealModalProps) {
  const [name, setName] = useState("");
  const [saveRecipe, setSaveRecipe] = useState(true);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setSaveRecipe(true);
    }
  }

  return (
    <Modal open={open} title="Agrupar en comida" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            showToast("Indica el nombre de la comida");
            return;
          }
          onConfirm(trimmed, saveRecipe);
        }}
      >
        <label className="field">
          <span>Nombre de la comida</span>
          <input
            type="text"
            placeholder="p. ej. Desayuno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field-check">
          <input
            type="checkbox"
            checked={saveRecipe}
            onChange={(e) => setSaveRecipe(e.target.checked)}
          />
          <span>También guardar como receta</span>
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()}>
          Agrupar{count > 0 ? ` (${count})` : ""}
        </button>
      </form>
    </Modal>
  );
}
