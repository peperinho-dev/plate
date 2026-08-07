// Re-scales one ingredient — ported from #ingredientGramsModal.
//
// Serves both a logged meal and a recipe draft, since the editing is
// identical; only what the caller does with the new value differs. The
// live preview matters here: "180 g" means nothing on its own, but the
// kcal it resolves to is the number you're actually deciding about.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { scaleFoodItem } from "../../../shared/lib/foodItems";
import type { FoodItemBasis } from "../../../shared/store/types";

interface IngredientGramsModalProps {
  open: boolean;
  item: FoodItemBasis | null;
  onClose: () => void;
  onSave: (grams: number) => void;
}

export function IngredientGramsModal({ open, item, onClose, onSave }: IngredientGramsModalProps) {
  const [grams, setGrams] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && item) setGrams(String(Math.round(item.grams)));
  }

  const parsed = parseFloat(grams);
  const preview = item && parsed > 0 ? scaleFoodItem({ ...item, grams: parsed }) : null;

  return (
    <Modal open={open} title={item?.name ?? "Editar cantidad"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(parsed > 0)) {
            showToast("Indica una cantidad válida");
            return;
          }
          onSave(parsed);
        }}
      >
        <label className="field">
          <span>Cantidad (g)</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            autoFocus
          />
        </label>
        {preview && (
          <p className="live-preview">
            {Math.round(preview.calories)} kcal · {Math.round(preview.protein)}P ·{" "}
            {Math.round(preview.fat)}F · {Math.round(preview.carbs)}C
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={!(parsed > 0)}>
          Guardar
        </button>
      </form>
    </Modal>
  );
}
