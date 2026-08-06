// Profile + goal settings, plus the export/import section vanilla also
// kept inline here. Weight logging and calorie-range editing are their
// own modals (WeightModal / TargetModal) — vanilla never bundled those
// into the profile sheet, and doing so just made this one modal several
// screens long for no reason.
import { useRef, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { exportData, importData } from "./dataTransfer";
import { showToast } from "../../shared/components/Toast";
import { useAppStore } from "../../shared/store";
import type { Profile } from "../../shared/store/types";
import { saveProfile } from "./actions";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onOpenWeight: () => void;
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

export function ProfileModal({ open, onClose, onOpenWeight }: ProfileModalProps) {
  const profile = useAppStore((s) => s.profile);
  const lastExportedAt = useAppStore((s) => s.lastExportedAt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState<Profile>(profile);

  // Re-seed the fields each time the sheet opens, so it never shows a
  // stale draft from a previous session.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(profile);
  }

  const patch = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    saveProfile(draft);
    showToast("Perfil guardado");
    onClose();
  };

  return (
    <Modal open={open} title="Perfil" onClose={onClose}>
      <div className="form">
        <div className="field-row">
          <label className="field">
            <span>Sexo</span>
            <select value={draft.sex ?? ""} onChange={(e) => patch({ sex: e.target.value as Profile["sex"] })}>
              <option value="" disabled>
                Selecciona
              </option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
            </select>
          </label>
          <label className="field">
            <span>Edad</span>
            <input
              type="number"
              min="10"
              max="100"
              step="1"
              inputMode="numeric"
              value={draft.age ?? ""}
              onChange={(e) => patch({ age: num(e.target.value) })}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Altura (cm)</span>
            <input
              type="number"
              min="100"
              max="250"
              step="1"
              inputMode="numeric"
              value={draft.heightCm ?? ""}
              onChange={(e) => patch({ heightCm: num(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Actividad</span>
            {/* A segmented control with 5 options doesn't fit a phone
                width — it overflows off-screen instead of wrapping.
                A select, like the vanilla app used here, has no such
                limit. */}
            <select
              value={draft.activityLevel ?? ""}
              onChange={(e) => patch({ activityLevel: e.target.value as Profile["activityLevel"] })}
            >
              <option value="" disabled>
                Selecciona
              </option>
              {ACTIVITY_LABELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
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
            <span>Ritmo: {(draft.rateKgPerWeek ?? 0.5).toFixed(2)} kg/semana</span>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              value={draft.rateKgPerWeek ?? 0.5}
              onChange={(e) => patch({ rateKgPerWeek: num(e.target.value) })}
            />
          </label>
        )}

        <button type="button" className="btn btn--primary btn--block" onClick={handleSave}>
          Guardar perfil
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={onOpenWeight}>
          Registro de peso →
        </button>
      </div>

      <span className="field-group-label">Datos</span>
      <div className="field-row">
        <button type="button" className="btn btn--secondary btn--block" onClick={() => void exportData()}>
          Exportar datos
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => fileInputRef.current?.click()}
        >
          Importar datos
        </button>
      </div>
      <p className="modal-hint">
        Tus datos viven solo en este dispositivo. Si borras la app de la pantalla de inicio, se
        borran con ella — exporta de vez en cuando.
        {lastExportedAt
          ? ` Última copia: ${new Date(lastExportedAt).toLocaleDateString("es-ES")}.`
          : " Todavía no has hecho ninguna."}
      </p>
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
    </Modal>
  );
}
