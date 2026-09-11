// How much of it — asked before the food is logged, not after.
//
// Tapping a search result logged it immediately at 100 g, and the only
// way to correct that was to stage it first and then tap the plate row.
// So the common case (a food you eat in a specific amount) meant logging
// something wrong on purpose and fixing it, and the amount was decided
// after the decision to log rather than as part of it.
//
// MacroFactor splits the two gestures: the small + on a tile adds it to
// the plate untouched for multi-add, while tapping the food itself opens
// a screen with its calories and macros and the units and quantity
// editable, and only then "Add" or "Log". That split is what this is —
// the + still stages instantly, and a tap comes here.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { gramsFromUnits, hasUnit, pluralize, unitsFromGrams } from "../../../shared/lib/quantity";
import { rescalePlateItem, type PlateItem } from "../plate";

interface PortionSheetProps {
  item: PlateItem | null;
  /** True when something is already staged, so "log" would orphan it. */
  plateHasItems: boolean;
  onClose: () => void;
  onStage: (item: PlateItem) => void;
  onLog: (item: PlateItem) => void;
}

export function PortionSheet({ item, plateHasItems, onClose, onStage, onLog }: PortionSheetProps) {
  const unitised = !!item?.basis && hasUnit(item.basis);
  const [mode, setMode] = useState<"g" | "unit">("g");
  const [value, setValue] = useState("");

  // Re-seeds whenever a different food is opened, so the field never
  // shows an amount left over from the last one. Units win when the food
  // has them: someone logging eggs thinks in eggs.
  const [lastId, setLastId] = useState(item?.id ?? null);
  if ((item?.id ?? null) !== lastId) {
    setLastId(item?.id ?? null);
    const startUnit = !!item?.basis && hasUnit(item.basis);
    setMode(startUnit ? "unit" : "g");
    setValue(
      item?.basis
        ? startUnit
          ? String(Math.round(unitsFromGrams(item.basis.grams, item.basis) * 10) / 10)
          : String(Math.round(item.basis.grams))
        : ""
    );
  }

  if (!item) return null;

  // Everything below reads off `scaled`, so the numbers on screen are
  // always the numbers that will be logged — no separate preview that can
  // drift from what the buttons actually do.
  const parsed = parseFloat(value.replace(",", "."));
  const grams =
    item.basis && Number.isFinite(parsed) && parsed > 0
      ? mode === "unit"
        ? gramsFromUnits(parsed, item.basis)
        : parsed
      : item.basis?.grams ?? 0;
  const scaled = item.basis ? rescalePlateItem(item, grams) : item;
  const valid = !item.basis || (Number.isFinite(parsed) && parsed > 0);

  return (
    <Modal open title={item.name} onClose={onClose}>
      <div className="portion-totals">
        <div className="portion-kcal">{Math.round(scaled.calories)} kcal</div>
        <div className="portion-macros">
          <span>{Math.round(scaled.protein)} P</span>
          <span>{Math.round(scaled.fat)} G</span>
          <span>{Math.round(scaled.carbs)} C</span>
        </div>
      </div>

      {item.basis ? (
        <>
          {unitised && (
            <div className="segmented segmented--compact">
              <button
                type="button"
                className={"segmented-btn" + (mode === "unit" ? " active" : "")}
                onClick={() => {
                  if (mode === "unit") return;
                  setMode("unit");
                  setValue(String(Math.round(unitsFromGrams(grams, item.basis!) * 10) / 10));
                }}
              >
                {pluralize(item.basis.unitName!, 2)}
              </button>
              <button
                type="button"
                className={"segmented-btn" + (mode === "g" ? " active" : "")}
                onClick={() => {
                  if (mode === "g") return;
                  setMode("g");
                  setValue(String(Math.round(grams)));
                }}
              >
                Gramos
              </button>
            </div>
          )}
          <label className="field">
            <span>
              {mode === "unit" && item.basis.unitName
                ? `Cantidad (${pluralize(item.basis.unitName, 2)})`
                : "Cantidad (g)"}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </label>
        </>
      ) : (
        // A recipe has no basis to scale against; it is adjusted by
        // expanding it on the plate instead.
        <p className="empty-state empty-state--inline">
          {item.qtyLabel} · ajústalo por ingredientes desde el plato.
        </p>
      )}

      <div className="portion-actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!valid}
          onClick={() => onStage(scaled)}
        >
          Al plato
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!valid}
          onClick={() => (plateHasItems ? onStage(scaled) : onLog(scaled))}
        >
          {plateHasItems ? "Añadir" : "Registrar"}
        </button>
      </div>
    </Modal>
  );
}
