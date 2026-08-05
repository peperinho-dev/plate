// Add / edit a food entry. Also the landing point for a scan: a detected
// barcode prefills this form, and confirming it teaches the local cache.
import { Modal } from "../../../shared/components/Modal";
import { ScanIcon } from "../../../shared/components/Icons";
import { deriveEntry, type EntryFormState } from "../entryForm";

interface EntryModalProps {
  open: boolean;
  title: string;
  form: EntryFormState;
  /** Set while adding from a scan, so the Hora field stays hidden. */
  isEditing: boolean;
  onChange: (patch: Partial<EntryFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onScanClick: () => void;
}

export function EntryModal({
  open,
  title,
  form,
  isEditing,
  onChange,
  onClose,
  onSubmit,
  onScanClick
}: EntryModalProps) {
  const derived = deriveEntry(form);
  // Live preview only means something when the amount is driving the
  // calories — a direct kcal total already shows its own number.
  const grams = parseFloat(form.grams);
  const showPreview =
    !!derived && !form.kcalTotal.trim() && !!form.kcalPer100.trim() && Number.isFinite(grams);

  const field = (key: keyof EntryFormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value })
  });

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {/*
        Offered only when creating an entry — re-scanning while editing an
        existing one would replace the very values being corrected.
      */}
      {!isEditing && (
        <button
          type="button"
          className="btn btn--secondary btn--block"
          style={{ marginBottom: 16 }}
          onClick={onScanClick}
        >
          <span className="btn-icon">
            <ScanIcon />
          </span>{" "}
          Escanear producto
        </button>
      )}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label className="field">
          <span>Nombre</span>
          <input type="text" required placeholder="p. ej. Yogur natural" {...field("name")} />
        </label>

        {isEditing && (
          <label className="field">
            <span>Hora</span>
            <input type="time" {...field("time")} />
          </label>
        )}

        {/*
          step="any" throughout: real Open Food Facts values are decimals
          (protein 6.5, fibra 3.1...). With a whole-number step the browser
          marks the field :invalid and silently refuses to submit the form,
          with no visible error — the vanilla app only avoided this by
          rounding nutrients to integers on prefill, which threw away real
          precision.
        */}
        <div className="field-row">
          <label className="field">
            <span>kcal / 100 g</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("kcalPer100")} />
          </label>
          <label className="field">
            <span>Cantidad (g)</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("grams")} />
          </label>
        </div>

        {showPreview && derived && (
          <p className="live-preview">
            {Math.round(derived.calories)} kcal · {Math.round(derived.protein)}P ·{" "}
            {Math.round(derived.fat)}F · {Math.round(derived.carbs)}C
          </p>
        )}

        <label className="field">
          <span>o directamente, kcal totales</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="opcional, anula lo anterior"
            {...field("kcalTotal")}
          />
        </label>

        <span className="field-group-label">Macros por 100 g (opcional)</span>
        <div className="field-row">
          <label className="field">
            <span>Proteína</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("proteinPer100")} />
          </label>
          <label className="field">
            <span>Grasa</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("fatPer100")} />
          </label>
          <label className="field">
            <span>Carbos</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("carbsPer100")} />
          </label>
        </div>

        <span className="field-group-label">Otros (por 100 g, opcional)</span>
        <div className="field-row">
          <label className="field">
            <span>Fibra (g)</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("fiberPer100")} />
          </label>
          <label className="field">
            <span>Azúcar (g)</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("sugarPer100")} />
          </label>
          <label className="field">
            <span>Sodio (mg)</span>
            <input type="number" min="0" step="any" inputMode="decimal" {...field("sodiumPer100")} />
          </label>
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={!derived}>
          {isEditing ? "Guardar" : "Añadir"}
        </button>
      </form>
    </Modal>
  );
}
