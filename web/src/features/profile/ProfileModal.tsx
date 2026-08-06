// Profile + weight + target settings. This is what makes the macro row in
// DayTotals appear at all: without a profile and a logged weight there's
// nothing to calculate targets from.
import { useRef, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { exportData, importData } from "./dataTransfer";
import { showToast } from "../../shared/components/Toast";
import { useAppStore } from "../../shared/store";
import type { Profile } from "../../shared/store/types";
import { latestWeightEntry } from "../../shared/lib/targets";
import { logWeight, saveProfile, setManualCalorieTarget, useCalculatedCalorieTarget } from "./actions";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const ACTIVITY_LABELS: { value: NonNullable<Profile["activityLevel"]>; label: string }[] = [
  { value: "sedentary", label: "Sedentario" },
  { value: "light", label: "Ligero" },
  { value: "moderate", label: "Moderado" },
  { value: "active", label: "Activo" },
  { value: "very_active", label: "Muy activo" }
];

const GOAL_LABELS: { value: NonNullable<Profile["goalType"]>; label: string }[] = [
  { value: "lose", label: "Perder" },
  { value: "maintain", label: "Mantener" },
  { value: "gain", label: "Ganar" }
];

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const profile = useAppStore((s) => s.profile);
  const weightLog = useAppStore((s) => s.weightLog);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const lastExportedAt = useAppStore((s) => s.lastExportedAt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const latest = latestWeightEntry(weightLog);
  const [draft, setDraft] = useState<Profile>(profile);
  const [weight, setWeight] = useState(latest ? String(latest.weightKg) : "");
  const [minKcal, setMinKcal] = useState(String(calorieTarget.min));
  const [maxKcal, setMaxKcal] = useState(String(calorieTarget.max));

  // Re-seed the fields each time the sheet opens, so it never shows a
  // stale draft from a previous session.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(profile);
      setWeight(latest ? String(latest.weightKg) : "");
      setMinKcal(String(calorieTarget.min));
      setMaxKcal(String(calorieTarget.max));
    }
  }

  const patch = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    const w = num(weight);
    if (w && w > 0) logWeight(w);
    saveProfile(draft);
    showToast("Perfil guardado");
    onClose();
  };

  const isCalculated = calorieTarget.mode === "calculated";

  return (
    <Modal open={open} title="Perfil y objetivos" onClose={onClose}>
      <div className="form">
        <div className="field-row">
          <label className="field">
            <span>Peso actual (kg)</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Altura (cm)</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={draft.heightCm ?? ""}
              onChange={(e) => patch({ heightCm: num(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Edad</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={draft.age ?? ""}
              onChange={(e) => patch({ age: num(e.target.value) })}
            />
          </label>
        </div>

        <div className="field">
          <span>Sexo</span>
          <div className="segmented segmented--compact">
            <button
              type="button"
              className={"segmented-btn" + (draft.sex === "male" ? " active" : "")}
              onClick={() => patch({ sex: "male" })}
            >
              Hombre
            </button>
            <button
              type="button"
              className={"segmented-btn" + (draft.sex === "female" ? " active" : "")}
              onClick={() => patch({ sex: "female" })}
            >
              Mujer
            </button>
          </div>
        </div>

        <div className="field">
          <span>Actividad</span>
          <div className="segmented segmented--compact">
            {ACTIVITY_LABELS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={"segmented-btn" + (draft.activityLevel === a.value ? " active" : "")}
                onClick={() => patch({ activityLevel: a.value })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Objetivo</span>
          <div className="segmented segmented--compact">
            {GOAL_LABELS.map((g) => (
              <button
                key={g.value}
                type="button"
                className={"segmented-btn" + (draft.goalType === g.value ? " active" : "")}
                onClick={() => patch({ goalType: g.value })}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {draft.goalType && draft.goalType !== "maintain" && (
          <label className="field">
            <span>Ritmo (kg por semana)</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="p. ej. 0.25"
              value={draft.rateKgPerWeek ?? ""}
              onChange={(e) => patch({ rateKgPerWeek: num(e.target.value) })}
            />
          </label>
        )}

        <button type="button" className="btn btn--primary btn--block" onClick={handleSave}>
          Guardar
        </button>

        <span className="field-group-label">Rango de calorías</span>
        <p className="modal-hint">
          {isCalculated
            ? "Calculado a partir de tu perfil y tu peso. Se actualiza solo."
            : "Ajustado a mano. No se recalcula con tu perfil."}
        </p>
        <div className="field-row">
          <label className="field">
            <span>Mínimo</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={minKcal}
              onChange={(e) => setMinKcal(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Máximo</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={maxKcal}
              onChange={(e) => setMaxKcal(e.target.value)}
            />
          </label>
        </div>
        <div className="field-row">
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
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
            Fijar a mano
          </button>

          {!isCalculated && calorieTarget.calculatedMin !== null && (
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={() => {
                useCalculatedCalorieTarget();
                showToast("Vuelto al calculado");
              }}
            >
              Usar calculado
            </button>
          )}
        </div>

        <span className="field-group-label">Copia de seguridad</span>
        <p className="modal-hint">
          Tus datos viven solo en este dispositivo. Si borras la app de la pantalla de inicio, se
          borran con ella — exporta de vez en cuando.
          {lastExportedAt
            ? ` Última copia: ${new Date(lastExportedAt).toLocaleDateString("es-ES")}.`
            : " Todavía no has hecho ninguna."}
        </p>
        <div className="field-row">
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void exportData()}>
            Exportar
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => fileInputRef.current?.click()}
          >
            Importar
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              // Destructive and irreversible, so it is always confirmed
              // explicitly rather than on the strength of picking a file.
              if (window.confirm("Esto reemplazará todos tus datos actuales con los del archivo. ¿Continuar?")) {
                if (importData(String(reader.result))) onClose();
              }
              if (fileInputRef.current) fileInputRef.current.value = "";
            };
            reader.readAsText(file);
          }}
        />
      </div>
    </Modal>
  );
}
