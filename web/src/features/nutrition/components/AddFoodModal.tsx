// The food logger: search, stage onto a plate, commit once.
//
// One field searches your own food instantly and offline — history,
// favourites and recipes are the same ranked list, not three chip rows
// that typing didn't filter. Open Food Facts is a second section you ask
// for, so the common case (re-logging something you eat often) never
// waits on the network.
//
// Picking doesn't log. Items stage onto the plate with the quantity you
// last had them at, and "Registrar" commits the lot — so a four-item meal
// is one pass with a review step, instead of four trips through a form.
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { PlusIcon, ScanIcon, XIcon } from "../../../shared/components/Icons";
import { foodEmoji } from "../foodEmoji";
import { searchFoods, type SearchHit } from "../../../shared/lib/foodLookup";
import { foldText } from "../../../shared/lib/text";
import { gramsFromUnits, hasUnit, pluralize, unitsFromGrams } from "../../../shared/lib/quantity";
import { useAppStore } from "../../../shared/store";
import { buildFoodCandidates, searchFoodCandidates } from "../foodCandidates";
import { basicToSearchHit, searchBasicFoods } from "../basicFoods";
import {
  explodePlateItem,
  plateItemFromCandidate,
  plateItemFromSearchHit,
  plateToRecipeItems,
  plateTotals,
  rescalePlateItem,
  type PlateItem
} from "../plate";
import { saveRecipe } from "../recipeActions";
import { PortionSheet } from "./PortionSheet";
import { showToast } from "../../../shared/components/Toast";

interface AddFoodModalProps {
  open: boolean;
  /** Hour being logged to — decides which foods count as go-tos. */
  hour: number;
  onClose: () => void;
  onScanClick: () => void;
  /** Opens the full form for food that isn't in any list yet. */
  onCreateManual: (name: string) => void;
  onCommit: (items: PlateItem[], groupName: string | null) => void;
  /** Lets a scan stage straight onto the plate without leaving. */
  pendingHit: SearchHit | null;
  onPendingHitConsumed: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  favorite: "Favorito",
  recipe: "Receta",
  history: ""
};

export function AddFoodModal({
  open,
  hour,
  onClose,
  onScanClick,
  onCreateManual,
  onCommit,
  pendingHit,
  onPendingHitConsumed
}: AddFoodModalProps) {
  // Per-slice so the sheet doesn't re-render on every unrelated store
  // change (a finished timer, a logged weight).
  const days = useAppStore((s) => s.days);
  const favorites = useAppStore((s) => s.favorites);
  const recipes = useAppStore((s) => s.recipes);
  const [query, setQuery] = useState("");
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [offResults, setOffResults] = useState<SearchHit[] | null>(null);
  const [offSearching, setOffSearching] = useState(false);
  // Off by default: logging one thing should be one tap, not tap-then-
  // confirm. Staging only earns its extra step when there's a meal to
  // assemble, so it's opt-in rather than the price of every add.
  const [grouping, setGrouping] = useState(false);
  const [groupName, setGroupName] = useState("");
  // Saving the plate as a recipe: the combination you just assembled is
  // exactly the thing worth keeping, and until now there was no way to
  // keep it from here — recipes could only be built in the old manual
  // form. MacroFactor offers the same move from the timeline.
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  // The food whose amount is being chosen, before it is staged or logged.
  const [portionItem, setPortionItem] = useState<PlateItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Which measure the field is currently in. Defaults to the food's own
  // unit when it has one: someone logging eggs thinks in eggs, not grams.
  const [editMode, setEditMode] = useState<"g" | "unit">("g");
  // Guards against a slow earlier request landing after a newer one.
  const requestSeq = useRef(0);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setPlate([]);
      setOffResults(null);
      setGrouping(false);
      setGroupName("");
      setSavingRecipe(false);
      setRecipeName("");
      setPortionItem(null);
      setEditingId(null);
    }
  }

  // A scan resolves outside this component; stage whatever it found.
  // Has to be an effect, not the adjust-during-render pattern used above:
  // that only works for a component's own state, and this also has to tell
  // the parent the hit was consumed. The callback lives in a ref so a
  // fresh closure each render doesn't re-fire it.
  const consumedRef = useRef(onPendingHitConsumed);
  consumedRef.current = onPendingHitConsumed;
  useEffect(() => {
    if (!pendingHit) return;
    setPlate((p) => [...p, plateItemFromSearchHit(pendingHit)]);
    consumedRef.current();
  }, [pendingHit]);

  const candidates = buildFoodCandidates(days, favorites, recipes, hour);
  const trimmed = query.trim();
  const results = searchFoodCandidates(candidates, query).slice(0, trimmed ? 8 : 6);
  // Basics you already log are dropped: your own entry carries the
  // quantity you actually eat, so showing a generic 100 g twin of it
  // would be the worse of two rows.
  const known = new Set(results.map((c) => foldText(c.name)));
  const basics = searchBasicFoods(trimmed).filter((b) => !known.has(foldText(b.name)));

  const canCreate =
    trimmed.length > 0 && !candidates.some((c) => foldText(c.name) === foldText(trimmed));

  const totals = plateTotals(plate);

  const runOffSearch = async () => {
    if (!trimmed) return;
    const seq = ++requestSeq.current;
    setOffSearching(true);
    try {
      const hits = await searchFoods(trimmed);
      if (seq === requestSeq.current) setOffResults(hits);
    } catch {
      if (seq === requestSeq.current) setOffResults([]);
    } finally {
      if (seq === requestSeq.current) setOffSearching(false);
    }
  };

  const stage = (item: PlateItem) => {
    setPlate((p) => [...p, item]);
    setQuery("");
    setOffResults(null);
  };

  // Two gestures, two intents — the split MacroFactor uses. The + on a
  // row stages it as it is, so several foods are several taps and nothing
  // interrupts. Tapping the row itself asks how much first, because a
  // food you eat in a particular amount was previously logged at 100 g
  // and left for you to correct afterwards.
  const pick = (item: PlateItem) => setPortionItem(item);

  const editingItem = plate.find((it) => it.id === editingId) ?? null;
  const editingUnit = hasUnit(editingItem?.basis);

  const startEditing = (item: PlateItem) => {
    if (!item.basis) return; // nothing to re-scale against
    setEditingId(item.id);
    const useUnit = hasUnit(item.basis);
    setEditMode(useUnit ? "unit" : "g");
    setEditValue(
      useUnit
        ? String(Math.round(unitsFromGrams(item.basis.grams, item.basis) * 10) / 10)
        : String(Math.round(item.basis.grams))
    );
  };

  // Switching measure converts what's already typed rather than clearing
  // it, so "2 huevos" becomes "110 g" instead of an empty box.
  const switchMode = (mode: "g" | "unit") => {
    if (mode === editMode || !editingItem?.basis) return;
    const n = parseFloat(editValue);
    if (Number.isFinite(n)) {
      const grams = editMode === "unit" ? gramsFromUnits(n, editingItem.basis) : n;
      setEditValue(
        mode === "unit"
          ? String(Math.round(unitsFromGrams(grams, editingItem.basis) * 10) / 10)
          : String(Math.round(grams))
      );
    }
    setEditMode(mode);
  };

  const commitEdit = () => {
    const n = parseFloat(editValue);
    const grams =
      editMode === "unit" && editingItem?.basis ? gramsFromUnits(n, editingItem.basis) : n;
    if (grams > 0) {
      setPlate((p) => p.map((it) => (it.id === editingId ? rescalePlateItem(it, grams) : it)));
    }
    setEditingId(null);
  };

  return (
    <Modal open={open} title="Añadir" onClose={onClose}>
      <div className="field-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Alimento</span>
          <input
            type="search"
            inputMode="search"
            placeholder="Buscar en lo tuyo…"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffResults(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (results.length > 0) pick(plateItemFromCandidate(results[0]));
              else if (trimmed) void runOffSearch();
            }}
            autoFocus
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

      {plate.length > 0 && (
        <div className="plate">
          <div className="plate-head">
            <span className="added-track-label">En el plato</span>
            <span className="plate-total">{Math.round(totals.calories)} kcal</span>
          </div>
          <div className="log-list">
            {plate.map((item) => (
              <div className="row" key={item.id}>
                <button
                  type="button"
                  className="row-main"
                  onClick={() => startEditing(item)}
                  disabled={!item.basis}
                >
                  <span className="row-name">{item.name}</span>
                  <span className="row-qty">
                    {item.qtyLabel}
                    {item.basis ? " · toca para ajustar" : ""}
                  </span>
                </button>
                {/* A recipe has no basis of its own, so the row cannot be
                    adjusted — but its ingredients can. */}
                {item.items && item.items.length > 0 && (
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    onClick={() =>
                      setPlate((p) => p.flatMap((x) => (x.id === item.id ? explodePlateItem(x) : [x])))
                    }
                  >
                    Ingredientes
                  </button>
                )}
                <span className="row-amount">{Math.round(item.calories)} kcal</span>
                <button
                  className="row-del"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() => setPlate((p) => p.filter((x) => x.id !== item.id))}
                >
                  <XIcon />
                </button>
              </div>
            ))}
          </div>
          {editingId && (
            <>
              {editingUnit && editingItem?.basis && (
                <div className="segmented segmented--compact">
                  <button
                    type="button"
                    className={"segmented-btn" + (editMode === "unit" ? " active" : "")}
                    onClick={() => switchMode("unit")}
                  >
                    {pluralize(editingItem.basis.unitName!, 2)}
                  </button>
                  <button
                    type="button"
                    className={"segmented-btn" + (editMode === "g" ? " active" : "")}
                    onClick={() => switchMode("g")}
                  >
                    Gramos
                  </button>
                </div>
              )}
              <div className="field-row">
                <label className="field" style={{ flex: 1 }}>
                  <span>
                    {editMode === "unit" && editingItem?.basis
                      ? `Cantidad (${pluralize(editingItem.basis.unitName!, 2)})`
                      : "Cantidad (g)"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit();
                      }
                    }}
                    autoFocus
                  />
                </label>
                <button type="button" className="btn btn--secondary" onClick={commitEdit}>
                  Listo
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick access, the way favourites already work. Recipes are in the
          search results too, but only if you remember the name — and the
          point of a recipe is that it is the meal you repeat, so it
          should be one tap from an empty field. */}
      {!trimmed && recipes.length > 0 && (
        <div className="quick-section">
          <div className="quick-label-row">
            <div className="quick-label">Recetas</div>
          </div>
          <div className="quick-row">
            {recipes.map((r) => {
              const c = candidates.find((x) => x.recipe?.id === r.id);
              if (!c) return null;
              return (
                <button
                  key={r.id}
                  type="button"
                  className="quick-chip"
                  onClick={() => stage(plateItemFromCandidate(c))}
                >
                  <span className="quick-chip-name">{r.name}</span>
                  <span className="quick-chip-kcal">{Math.round(c.calories)} kcal</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="log-list">
        {results.map((c) => (
          <div className="row" key={c.key}>
            <span className="row-emoji" aria-hidden="true">{foodEmoji(c.name)}</span>
            <button
              type="button"
              className="row-main"
              onClick={() => pick(plateItemFromCandidate(c))}
            >
              <span className="row-name">
                {c.name}
                {c.isGoTo && <span className="row-badge">habitual</span>}
              </span>
              <span className="row-qty">
                {[SOURCE_LABEL[c.source], c.qtyLabel].filter(Boolean).join(" · ")}
              </span>
            </button>
            <span className="row-amount">{Math.round(c.calories)} kcal</span>
            <button
              type="button"
              className="row-add"
              aria-label={`Añadir ${c.name} al plato`}
              onClick={() => stage(plateItemFromCandidate(c))}
            >
              <PlusIcon />
            </button>
          </div>
        ))}
        {canCreate && (
          <div className="row">
            <button type="button" className="row-main" onClick={() => onCreateManual(trimmed)}>
              <span className="row-name">Crear “{trimmed}” a mano</span>
              <span className="row-qty">Con sus macros</span>
            </button>
          </div>
        )}
        {!trimmed && results.length === 0 && (
          <p className="empty-state empty-state--inline">
            Busca un alimento, escanéalo, o créalo a mano.
          </p>
        )}
      </div>

      {/* Generic foods, between your own history and the barcode
          database — the order MacroFactor uses, and for the same reason:
          branded products are normally reached by scanning, so they are
          the last thing a typed query should lead with. These come from
          the bundle, so they answer instantly and offline. */}
      {basics.length > 0 && (
        <div className="quick-section">
          <div className="quick-label-row">
            <div className="quick-label">Básicos</div>
          </div>
          <div className="log-list">
            {basics.map((b) => {
              const hit = basicToSearchHit(b);
              return (
                <div className="row" key={b.id}>
                  <span className="row-emoji" aria-hidden="true">{foodEmoji(b.name)}</span>
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => pick(plateItemFromSearchHit(hit))}
                  >
                    <span className="row-name">{b.name}</span>
                    <span className="row-qty">{Math.round(b.kcal)} kcal / 100 g</span>
                  </button>
                  <button
                    type="button"
                    className="row-add"
                    aria-label={`Añadir ${b.name} al plato`}
                    onClick={() => stage(plateItemFromSearchHit(hit))}
                  >
                    <PlusIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Asked for rather than automatic: the common case is re-logging
          something you already eat, and that shouldn't wait on a network
          round-trip — or fail when you're offline in a supermarket. */}
      {trimmed.length > 0 && (
        <div className="quick-section">
          <div className="quick-label-row">
            <div className="quick-label">Productos de marca</div>
            {offResults === null && (
              <button type="button" className="link-btn" onClick={() => void runOffSearch()}>
                {offSearching ? "Buscando…" : "Buscar"}
              </button>
            )}
          </div>
          {offResults !== null && offResults.length === 0 && (
            <p className="empty-state empty-state--inline">Sin resultados.</p>
          )}
          {offResults !== null && offResults.length > 0 && (
            <div className="log-list">
              {offResults.map((hit) => (
                <div className="row" key={hit.id}>
                  <span className="row-emoji" aria-hidden="true">{foodEmoji(hit.name)}</span>
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => pick(plateItemFromSearchHit(hit))}
                  >
                    <span className="row-name">{hit.name}</span>
                    <span className="row-qty">{Math.round(hit.kcalPer100 ?? 0)} kcal / 100 g</span>
                  </button>
                  <button
                    type="button"
                    className="row-add"
                    aria-label={`Añadir ${hit.name} al plato`}
                    onClick={() => stage(plateItemFromSearchHit(hit))}
                  >
                    <PlusIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PortionSheet
        item={portionItem}
        plateHasItems={plate.length > 0}
        onClose={() => setPortionItem(null)}
        onStage={(item) => {
          setPortionItem(null);
          stage(item);
        }}
        onLog={(item) => {
          setPortionItem(null);
          onCommit([item], null);
        }}
      />

      {plate.length > 0 && (
        <div className="form">
          {/* Keep the combination, not just log it. A meal you repeat at
              the same weights is a recipe — and it was only creatable in
              the old manual form, which is why recipes felt gone. Saving
              here never touches what you log: the entry is a snapshot, so
              editing the recipe later leaves your history alone. */}
          {plate.length > 1 &&
            (savingRecipe ? (
              <div className="field-row">
                <label className="field" style={{ flex: 1 }}>
                  <span>Nombre de la receta</span>
                  <input
                    type="text"
                    placeholder="p. ej. Avena con leche"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    autoFocus
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={!recipeName.trim()}
                  onClick={() => {
                    saveRecipe(recipeName.trim(), plateToRecipeItems(plate));
                    setSavingRecipe(false);
                    setRecipeName("");
                    showToast("Receta guardada");
                  }}
                >
                  Guardar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="link-btn"
                onClick={() => setSavingRecipe(true)}
              >
                Guardar como receta
              </button>
            ))}

          {/* Offered, not imposed: separate rows stay the default, because
              a day you can read food-by-food is more useful than a tidy
              one. Only worth asking once there's more than one thing. */}
          {plate.length > 1 && (
            <>
              <label className="field-check">
                <input
                  type="checkbox"
                  checked={grouping}
                  onChange={(e) => setGrouping(e.target.checked)}
                />
                <span>Agrupar como una comida</span>
              </label>
              {grouping && (
                <label className="field">
                  <span>Nombre de la comida</span>
                  <input
                    type="text"
                    placeholder="p. ej. Desayuno"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => onCommit(plate, grouping && groupName.trim() ? groupName.trim() : null)}
          >
            Registrar ({plate.length}) · {Math.round(totals.calories)} kcal
          </button>
        </div>
      )}
    </Modal>
  );
}
