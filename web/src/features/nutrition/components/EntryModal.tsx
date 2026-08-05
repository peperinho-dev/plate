// Add / edit a food entry. Also the landing point for a scan: a detected
// barcode prefills this form, and confirming it teaches the local cache.
import { useRef, useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { ScanIcon } from "../../../shared/components/Icons";
import { searchFoods, type SearchHit } from "../../../shared/lib/foodLookup";
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
  /** Fills the form from a search result. */
  onPickSearchResult: (hit: SearchHit) => void;
}

export function EntryModal({
  open,
  title,
  form,
  isEditing,
  onChange,
  onClose,
  onSubmit,
  onScanClick,
  onPickSearchResult
}: EntryModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // Guards against a slow earlier request landing after a newer one and
  // overwriting fresher results.
  const requestSeq = useRef(0);

  const runSearch = async () => {
    const term = query.trim();
    if (!term) return;
    const seq = ++requestSeq.current;
    setSearching(true);
    try {
      const hits = await searchFoods(term);
      if (seq === requestSeq.current) setResults(hits);
    } catch {
      if (seq === requestSeq.current) setResults([]);
    } finally {
      if (seq === requestSeq.current) {
        setSearching(false);
        setSearched(true);
      }
    }
  };

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
        <>
          <div className="field-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Buscar alimento</span>
              <input
                type="text"
                placeholder="p. ej. yogur natural"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter searches instead of submitting the entry form —
                  // the search input lives outside the form, but this is
                  // the key people reach for.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn--secondary btn--icon-only"
              aria-label="Escanear código de barras"
              onClick={onScanClick}
            >
              <ScanIcon size={19} />
            </button>
          </div>

          {searching && <p className="modal-hint modal-hint--loading">Buscando…</p>}
          {!searching && searched && results.length === 0 && (
            <p className="modal-hint">Sin resultados. Escanéalo o añádelo a mano.</p>
          )}
          {results.length > 0 && (
            <div className="log-list">
              {results.map((hit) => (
                <div className="row" key={hit.id}>
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => {
                      onPickSearchResult(hit);
                      setResults([]);
                      setSearched(false);
                      setQuery("");
                    }}
                  >
                    <span className="row-name">{hit.name}</span>
                    <span className="row-qty">{Math.round(hit.kcalPer100 ?? 0)} kcal / 100 g</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <span className="field-group-label">o a mano</span>
        </>
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
