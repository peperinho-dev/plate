// Calorie range editing — "Meta diaria". Split out of ProfileModal: vanilla
// kept this as its own modal reached by tapping the kcal chip, and folding
// it into the profile sheet just made that sheet twice as long for no
// reason.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { showToast } from "../../shared/components/Toast";
import { useAppStore } from "../../shared/store";
import { setManualCalorieTarget, adoptCalculatedCalorieTarget } from "./actions";

interface TargetModalProps {
  open: boolean;
  onClose: () => void;
}

export function TargetModal({ open, onClose }: TargetModalProps) {
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const [minKcal, setMinKcal] = useState(String(calorieTarget.min));
  const [maxKcal, setMaxKcal] = useState(String(calorieTarget.max));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMinKcal(String(calorieTarget.min));
      setMaxKcal(String(calorieTarget.max));
    }
  }

  const isCalculated = calorieTarget.mode === "calculated";
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <Modal open={open} title="Meta diaria" onClose={onClose}>
      <p className="modal-hint">
        {isCalculated
          ? "Calculado a partir de tu perfil y tu peso. Se actualiza solo."
          : "Ajustado a mano. No se recalcula con tu perfil."}
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const lo = num(minKcal);
          const hi = num(maxKcal);
          if (lo === null || hi === null || hi < lo) {
            showToast("Revisa el rango");
            return;
          }
          setManualCalorieTarget(lo, hi);
          showToast("Rango ajustado");
        }}
      >
        <div className="field-row">
          <label className="field">
            <span>Mínimo (kcal)</span>
            <input
              type="number"
              min="0"
              step="10"
              inputMode="numeric"
              value={minKcal}
              onChange={(e) => setMinKcal(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Máximo (kcal)</span>
            <input
              type="number"
              min="0"
              step="10"
              inputMode="numeric"
              value={maxKcal}
              onChange={(e) => setMaxKcal(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="btn btn--primary btn--block">
          Guardar rango manual
        </button>
        {!isCalculated && calorieTarget.calculatedMin !== null && (
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
              adoptCalculatedCalorieTarget();
              showToast("Vuelto al calculado");
            }}
          >
            Volver al cálculo automático
          </button>
        )}
      </form>
    </Modal>
  );
}
