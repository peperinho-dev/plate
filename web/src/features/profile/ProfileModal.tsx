// Profile + goal settings.
//
// Export/import used to live at the bottom of this sheet, which is why
// the Ajustes index sent "Copia de seguridad" here. It has its own sheet
// now (BackupModal) and this one is only about who you are and what
// you're aiming at.
//
// Weight logging and calorie-range editing are their own modals
// (WeightModal / TargetModal) — vanilla never bundled those into the
// profile sheet, and doing so just made this one modal several screens
// long for no reason.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { showToast } from "../../shared/components/Toast";
import { useAppStore } from "../../shared/store";
import type { Profile } from "../../shared/store/types";
import { saveProfile } from "./actions";
import { computeEma } from "./adaptive";
import { formatGoalDate } from "../../shared/lib/format";

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

  const [draft, setDraft] = useState<Profile>(profile);

  // Re-seed the fields each time the sheet opens, so it never shows a
  // stale draft from a previous session.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(profile);
  }

  // "If you start today at this rate, you arrive on…" — recomputed from
  // the draft on every keystroke and slider move, so the rate you pick has
  // a visible consequence while you are picking it rather than only after
  // you save. Deliberately measured from today rather than from the goal's
  // recorded start: while you are editing, you *are* starting over.
  const weightLog = useAppStore((s) => s.weightLog);
  const trendNow = (() => {
    const ema = computeEma([...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1)));
    return ema.length ? ema[ema.length - 1].ema : null;
  })();
  const draftEta = (() => {
    const target = draft.targetWeightKg;
    const rate = draft.rateKgPerWeek;
    if (draft.goalType == null || draft.goalType === "maintain") return null;
    if (target == null || rate == null || rate <= 0 || trendNow == null) return null;
    const remaining = target - trendNow;
    // A target on the wrong side of where you are is not a goal this rate
    // can reach — say so rather than projecting a date in the past.
    const signed = draft.goalType === "lose" ? -rate : rate;
    if (Math.sign(remaining) !== Math.sign(signed) || Math.abs(remaining) < 0.05) return null;
    const weeks = remaining / signed;
    return {
      weeks,
      date: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000),
      kg: Math.abs(remaining)
    };
  })();

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

        {/* Optional on purpose: a rate alone is a complete goal, and the
            app worked that way before this field existed. Giving it a
            destination is what turns the rate into progress you can be
            finished with. */}
        {draft.goalType && (
          <label className="field">
            <span>
              Peso objetivo{" "}
              <span className="field-optional">
                {draft.goalType === "maintain" ? "· peso a mantener" : "· opcional"}
              </span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="30"
              max="300"
              placeholder="kg"
              value={draft.targetWeightKg ?? ""}
              onChange={(e) => patch({ targetWeightKg: num(e.target.value) })}
            />
          </label>
        )}

        {draftEta && (
          <p className="goal-eta">
            {/* The date answers the question the field just asked, so it
                leads; the arithmetic that produced it reads as a footnote
                under it rather than running on from the date. */}
            <span className="goal-eta-date">Lo alcanzarías el {formatGoalDate(draftEta.date)}</span>
            <span className="goal-eta-note">
              {draftEta.kg.toFixed(1)} kg en {Math.round(draftEta.weeks)}{" "}
              {Math.round(draftEta.weeks) === 1 ? "semana" : "semanas"}, a tu ritmo actual
            </span>
          </p>
        )}

        <button type="button" className="btn btn--primary btn--block" onClick={handleSave}>
          Guardar perfil
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={onOpenWeight}>
          Registro de peso →
        </button>
      </div>

    </Modal>
  );
}
