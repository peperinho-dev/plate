// The Nutrición tab. Structure mirrors the #nutritionView markup in the
// vanilla index.html so the ported stylesheet applies unchanged.
import { useEffect, useState } from "react";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { atHourOnDay, rebaseTimeToDay, todayKey } from "../../shared/lib/date";
import { cloneEntry } from "../../shared/lib/cloneEntry";
import { formatDateLabel, capitalizeFirst } from "../../shared/lib/format";
import { WeekStrip } from "../../shared/components/WeekStrip";
import { CalendarModal } from "../../shared/components/CalendarModal";
import { ChevronLeft, ChevronRight, TargetIcon } from "../../shared/components/Icons";
import { EntryList } from "./components/EntryList";
import { DayTotals } from "./components/DayTotals";
import { NutritionOverviewModal } from "./components/NutritionOverviewModal";
import { PasteTargetSheet } from "./components/PasteTargetSheet";
import { EntryModal } from "./components/EntryModal";
import { ScanModal } from "./components/ScanModal";
import { BackupBanner } from "../profile/BackupBanner";
import { AdaptiveBanner } from "../profile/AdaptiveBanner";
import { RecipeModal } from "./components/RecipeModal";
import { GroupMealModal } from "./components/GroupMealModal";
import { RenameGroupModal } from "./components/RenameGroupModal";
import { IngredientGramsModal } from "./components/IngredientGramsModal";
import { AddFoodModal } from "./components/AddFoodModal";
import { plateItemToEntry, type PlateItem } from "./plate";
import { entryFromRecipe } from "./recipeActions";
import { sumFoodItems } from "../../shared/lib/foodItems";
import { QuickAddRows } from "./components/QuickAddRows";
import { computeHourlyGoTos, computeRecentItems, favoriteToQuickItem, type QuickItem } from "./quickAdd";
import {
  addEntry,
  addFavorite,
  commitPlate,
  groupEntries,
  renameGroupEntry,
  setGroupItemGrams,
  pasteEntriesToDay,
  rememberScannedProduct,
  removeFavorite,
  updateEntry
} from "./actions";
import { showToast } from "../../shared/components/Toast";
import { lookupBarcode } from "../../shared/lib/foodLookup";
import type { Entry } from "../../shared/store/types";
import { deriveEntry, emptyEntryForm, formFromEntry, formFromLookup, type EntryFormState } from "./entryForm";

export function NutritionView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const openModal = useUiStore((s) => s.openModal);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const setClipboard = useUiStore((s) => s.setClipboard);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedEntryIds = useUiStore((s) => s.selectedEntryIds);
  const setSelectionMode = useUiStore((s) => s.setSelectionMode);
  const selectEntries = useUiStore((s) => s.selectEntries);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const days = useAppStore((s) => s.days);

  const dayKey = todayKey(dayOffset);
  const entries = days[dayKey]?.entries ?? [];
  const label = formatDateLabel(dayOffset);

  // Previous day is offered as a one-tap starting point on an empty day.
  const prevEntries = days[todayKey(dayOffset - 1)]?.entries ?? [];

  // Copiar scopes to the checked entries whenever a selection is active —
  // otherwise it copies the whole day. (The vanilla version originally
  // always copied the day, which read as a bug once anything was ticked.)
  const selectedCount = selectedEntryIds.size;
  const startTransfer = (intent: "copy" | "move") => {
    const source = selectionMode && selectedCount > 0
      ? entries.filter((e) => selectedEntryIds.has(e.id))
      : entries;
    if (source.length === 0) return;
    setClipboard({
      type: "nutrition",
      entries: source.map((e) => cloneEntry(e)),
      intent,
      sourceDayKey: dayKey
    });
    if (selectionMode) setSelectionMode(false);
    openModal("paste");
  };
  const handleCopy = () => startTransfer("copy");
  const handleMove = () => startTransfer("move");

  const handleCopyYesterday = () => {
    pasteEntriesToDay(prevEntries, dayKey, "keep");
    showToast("Copiado de ayer");
  };

  // --- Add / scan flow -------------------------------------------------
  const [entryOpen, setEntryOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [form, setForm] = useState<EntryFormState>(emptyEntryForm);
  // Barcode the current form came from, so confirming it can teach the
  // local cache. Null for a purely manual entry.
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  // Set when the form is editing an already-logged entry rather than
  // creating one; also reveals the Hora field.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [favoritesEditing, setFavoritesEditing] = useState(false);
  const [recipesEditing, setRecipesEditing] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [renameEntry, setRenameEntry] = useState<Entry | null>(null);
  // Which ingredient of which logged meal the grams sheet is editing.
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  // Which hour the logger is filing into. Null means "now", which is what
  // the central + and the top bar's add both mean; a number comes from
  // tapping the + on one of the timeline's hour rows.
  const [targetHour, setTargetHour] = useState<number | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  // A scan resolves here and is handed to the sheet to stage.
  const [pendingHit, setPendingHit] = useState<import("../../shared/lib/foodLookup").SearchHit | null>(null);
  const [gramsTarget, setGramsTarget] = useState<{ entryId: string; index: number } | null>(null);
  const gramsItem = gramsTarget
    ? (entries.find((e) => e.id === gramsTarget.entryId)?.items?.[gramsTarget.index] ?? null)
    : null;

  const favorites = useAppStore((s) => s.favorites);
  const recipes = useAppStore((s) => s.recipes);
  const favoriteItems = favorites.map(favoriteToQuickItem);
  const recentItems = computeRecentItems(days);
  const goToItems = computeHourlyGoTos(days, new Date().getHours());

  // One tap logs the item straight onto the visible day — the whole point
  // of these chips is skipping the form entirely.
  const handleQuickAdd = (item: QuickItem) => {
    addEntry(dayKey, {
      name: item.name,
      calories: item.calories,
      qtyLabel: item.qtyLabel,
      protein: item.protein,
      fat: item.fat,
      carbs: item.carbs,
      fiber: item.fiber,
      sugar: item.sugar,
      sodium: item.sodium,
      addedAt: Date.now()
    });
    setEntryOpen(false);
    showToast("Añadido");
  };

  // The central + records an intent rather than reaching into this view's
  // modals; pick it up and clear it.
  const pendingAction = useUiStore((s) => s.pendingAction);
  const clearAction = useUiStore((s) => s.clearAction);
  const requestAction = useUiStore((s) => s.requestAction);
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === "food") setAddFoodOpen(true);
    else if (pendingAction === "scan") setScanOpen(true);
    else return; // not ours — leave it for the view that owns it
    clearAction();
  }, [pendingAction, clearAction]);

  const handlePlateCommit = (items: PlateItem[], groupName: string | null) => {
    // Stamped on the day being viewed rather than "now", so logging to an
    // earlier day files the entry under that day's clock time instead of
    // today's. The +i keeps the staged order stable within the same second.
    //
    // An hour-row + overrides the clock entirely: you tapped 11:00 because
    // that is when you ate, so the entry lands at 11:00 rather than
    // whenever you got round to logging it.
    const base =
      targetHour == null
        ? rebaseTimeToDay(Date.now(), dayKey)
        : atHourOnDay(dayKey, targetHour);
    commitPlate(dayKey, items.map((it, i) => plateItemToEntry(it, base + i)), groupName);
    closeAddFood();
    showToast(groupName ? `${groupName} registrada` : items.length === 1 ? "Añadido" : `${items.length} añadidos`);
  };

  // One close path, so a target hour can't survive the sheet and quietly
  // misfile the next thing logged from the central +.
  const closeAddFood = () => {
    setAddFoodOpen(false);
    setTargetHour(null);
  };

  const patchForm = (patch: Partial<EntryFormState>) => setForm((f) => ({ ...f, ...patch }));

  const openEntryForEdit = (entry: Entry) => {
    setForm(formFromEntry(entry));
    setPendingBarcode(null);
    setEditingEntryId(entry.id);
    setEntryOpen(true);
  };

  const handleDetected = async (barcode: string) => {
    setScanOpen(false);
    setPendingBarcode(barcode);
    showToast(`Buscando ${barcode}…`);
    const result = await lookupBarcode(useAppStore.getState(), barcode);
    if (result) {
      // Straight onto the plate, so scanning three things in a shop is
      // three scans rather than three trips through the form.
      const { source, ...rest } = result;
      setPendingHit({ ...rest, id: barcode });
      showToast(source === "cache" ? "Producto guardado en este dispositivo" : "Producto encontrado");
      setAddFoodOpen(true);
    } else {
      // Nothing known anywhere — the user fills it in once, and the cache
      // makes every future scan of this barcode instant.
      setForm({ ...emptyEntryForm(), name: "" });
      showToast("No encontrado. Añádelo y lo recordaré.");
      setEntryOpen(true);
    }
  };

  const handleEntrySubmit = () => {
    const derived = deriveEntry(form);
    if (!derived) return;

    const nutrition = {
      name: derived.name,
      calories: derived.calories,
      qtyLabel: derived.qtyLabel,
      protein: derived.protein,
      fat: derived.fat,
      carbs: derived.carbs,
      fiber: derived.fiber,
      sugar: derived.sugar,
      sodium: derived.sodium,
      // Taken whole from deriveEntry rather than rebuilt field by field:
      // copying it by hand is what dropped the basis originally, and then
      // dropped the unit when that was added.
      basis: derived.basis
    };

    if (editingEntryId) {
      // Keep the entry on its original day, only moving its time-of-day to
      // whatever the Hora field says.
      const existing = entries.find((e) => e.id === editingEntryId);
      let addedAt = existing?.addedAt ?? Date.now();
      const [h, m] = form.time.split(":").map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const d = new Date(addedAt);
        d.setHours(h, m, 0, 0);
        addedAt = d.getTime();
      }
      updateEntry(dayKey, editingEntryId, { ...nutrition, addedAt });
      showToast("Guardado");
    } else {
      addEntry(dayKey, { ...nutrition, addedAt: Date.now() });
      if (pendingBarcode) rememberScannedProduct(pendingBarcode, form);
      showToast("Añadido");
    }

    setEntryOpen(false);
    setPendingBarcode(null);
    setEditingEntryId(null);
  };

  return (
    <div className="view">
      <header className="topbar">
        <div className="day-nav">
          <button className="icon-btn" aria-label="Día anterior" onClick={() => shiftDay(-1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="day-label" onClick={() => openCalendar("navigate")}>
            {label.short}
          </button>
          <button className="icon-btn" aria-label="Día siguiente" onClick={() => shiftDay(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="topbar-actions">
          {/* Ajustes is its own tab now, so these hand off rather than
              keeping a second copy of those sheets alive in here. */}
          <button className="chip" onClick={() => requestAction("target")}>
            {calorieTarget.min}–{calorieTarget.max} kcal
          </button>
        </div>
      </header>

      <WeekStrip />
      <BackupBanner />
      <AdaptiveBanner />

      <main className="content">
        {/* Totals lead the tab: the number you opened the app to check
            shouldn't be below a scrollable list of everything you ate. */}
        {/* The card opens the overview, but the mode switch inside it is
            its own control — hence a wrapper with an explicit button
            rather than an onClick on the card, which would swallow the
            toggle's taps. */}
        <div className="card card--totals">
          <DayTotals entries={entries} dayKey={dayKey} />
          <button
            type="button"
            className="totals-more"
            onClick={() => setOverviewOpen(true)}
          >
            Resumen nutricional
          </button>
        </div>

        <div className="card">
          <div className="card-date-row">
            <div className="card-date">
              {capitalizeFirst(`${label.weekday}, ${label.day} de ${label.month}`)}
            </div>
            {/*
              Long-press is the only way into multi-select, so the header
              carries no controls by default — they appear only once a
              selection is under way. "Todo" is what keeps whole-day copy
              reachable without a permanently visible Copiar button.
            */}
            <div className="card-date-actions">
              {selectionMode && (
                <>
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    onClick={() => selectEntries(entries.map((e) => e.id))}
                  >
                    Todo
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleCopy}
                    disabled={selectedCount === 0}
                  >
                    Copiar{selectedCount > 0 ? ` (${selectedCount})` : ""}
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleMove}
                    disabled={selectedCount === 0}
                  >
                    Mover
                  </button>
                  <button type="button" className="link-btn link-btn--muted" onClick={() => setSelectionMode(false)}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {entries.length > 0 ? (
            <EntryList
              entries={entries}
              dayKey={dayKey}
              onAddAtHour={(hour) => {
                setTargetHour(hour);
                setAddFoodOpen(true);
              }}
              onEdit={openEntryForEdit}
              onEditGroup={setRenameEntry}
              onEditItem={(e, index) => setGramsTarget({ entryId: e.id, index })}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <TargetIcon size={34} strokeWidth={1.6} />
              </div>
              <p>
                Sin artículos todavía.
                <br />
                Escanea o añade el primero.
              </p>
              {prevEntries.length > 0 && (
                <button type="button" className="link-btn" onClick={handleCopyYesterday}>
                  Copiar de ayer
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* There is no standing action bar any more — the central + covers
          adding. Selection still needs somewhere to act from, though, and
          this only exists while something is selected. */}
      {selectionMode && (
        <div className="action-bar">
          <button
            className="btn btn--primary btn--block"
            disabled={selectedCount < 2}
            onClick={() => setGroupOpen(true)}
          >
            Agrupar ({selectedCount})
          </button>
        </div>
      )}


      <GroupMealModal
        open={groupOpen}
        count={selectedCount}
        onClose={() => setGroupOpen(false)}
        onConfirm={(name, alsoSaveRecipe) => {
          groupEntries(dayKey, selectedEntryIds, name, alsoSaveRecipe);
          setGroupOpen(false);
          setSelectionMode(false);
          showToast(alsoSaveRecipe ? "Comida agrupada y guardada como receta" : "Comida agrupada");
        }}
      />
      <RenameGroupModal
        open={renameEntry !== null}
        entry={renameEntry}
        onClose={() => setRenameEntry(null)}
        onSave={(name, time) => {
          if (renameEntry) renameGroupEntry(dayKey, renameEntry.id, name, time || null);
          setRenameEntry(null);
        }}
      />
      <IngredientGramsModal
        open={gramsTarget !== null}
        item={gramsItem}
        onClose={() => setGramsTarget(null)}
        onSave={(grams) => {
          if (gramsTarget) setGroupItemGrams(dayKey, gramsTarget.entryId, gramsTarget.index, grams);
          setGramsTarget(null);
        }}
      />
      <NutritionOverviewModal
        open={overviewOpen}
        dayKey={dayKey}
        onClose={() => setOverviewOpen(false)}
      />
      <PasteTargetSheet />
      <CalendarModal />
      <EntryModal
        open={entryOpen}
        title={editingEntryId ? "Editar alimento" : pendingBarcode ? "Confirmar producto" : "Añadir alimento"}
        form={form}
        isEditing={!!editingEntryId}
        onChange={patchForm}
        onClose={() => setEntryOpen(false)}
        onSubmit={handleEntrySubmit}
        onScanClick={() => {
          setEntryOpen(false);
          setScanOpen(true);
        }}
        quickAdd={
          <QuickAddRows
            favorites={favoriteItems}
            goTos={goToItems}
            recents={recentItems}
            onPick={handleQuickAdd}
            onRemoveFavorite={removeFavorite}
            favoritesEditing={favoritesEditing}
            onToggleFavoritesEditing={() => setFavoritesEditing((v) => !v)}
            recipes={recipes.map((r) => ({
              id: r.id,
              name: r.name,
              calories: sumFoodItems(r.items).calories
            }))}
            onPickRecipe={(id) => {
              const recipe = recipes.find((r) => r.id === id);
              if (!recipe) return;
              addEntry(dayKey, entryFromRecipe(recipe));
              setEntryOpen(false);
              showToast("Añadido");
            }}
            onNewRecipe={() => {
              setEditingRecipeId(null);
              setEntryOpen(false);
              setRecipeModalOpen(true);
            }}
            onEditRecipe={(id) => {
              setEditingRecipeId(id);
              setEntryOpen(false);
              setRecipeModalOpen(true);
            }}
            recipesEditing={recipesEditing}
            onToggleRecipesEditing={() => setRecipesEditing((v) => !v)}
          />
        }
        onSaveFavorite={() => {
          const d = deriveEntry(form);
          if (!d) return;
          addFavorite({
            name: d.name,
            calories: d.calories,
            qtyLabel: d.qtyLabel,
            protein: d.protein,
            fat: d.fat,
            carbs: d.carbs,
            fiber: d.fiber,
            sugar: d.sugar,
            sodium: d.sodium
          });
          showToast("Guardado en favoritos");
        }}
        onPickSearchResult={(hit) => {
          // Searched items have no barcode context, so picking one must not
          // teach the cache — that's keyed by the scanned code.
          setPendingBarcode(null);
          setForm(formFromLookup({ ...hit, source: "openfoodfacts" }));
        }}
      />
      <AddFoodModal
        open={addFoodOpen}
        hour={targetHour ?? new Date().getHours()}
        onClose={closeAddFood}
        onScanClick={() => setScanOpen(true)}
        onCreateManual={(name) => {
          closeAddFood();
          setForm({ ...emptyEntryForm(), name });
          setPendingBarcode(null);
          setEditingEntryId(null);
          setEntryOpen(true);
        }}
        onCommit={handlePlateCommit}
        pendingHit={pendingHit}
        onPendingHitConsumed={() => setPendingHit(null)}
      />
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleDetected} />
      <RecipeModal
        open={recipeModalOpen}
        recipe={editingRecipeId ? (recipes.find((r) => r.id === editingRecipeId) ?? null) : null}
        onClose={() => {
          setRecipeModalOpen(false);
          setEditingRecipeId(null);
        }}
      />
    </div>
  );
}
