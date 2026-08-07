// The Nutrición tab. Structure mirrors the #nutritionView markup in the
// vanilla index.html so the ported stylesheet applies unchanged.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { formatDateLabel, capitalizeFirst } from "../../shared/lib/format";
import { WeekStrip } from "../../shared/components/WeekStrip";
import { CalendarModal } from "../../shared/components/CalendarModal";
import { ChevronLeft, ChevronRight, GearIcon, ScanIcon, TargetIcon } from "../../shared/components/Icons";
import { EntryList } from "./components/EntryList";
import { DayTotals } from "./components/DayTotals";
import { PasteTargetSheet } from "./components/PasteTargetSheet";
import { EntryModal } from "./components/EntryModal";
import { ScanModal } from "./components/ScanModal";
import { ProfileModal } from "../profile/ProfileModal";
import { WeightModal } from "../profile/WeightModal";
import { TargetModal } from "../profile/TargetModal";
import { BackupBanner } from "../profile/BackupBanner";
import { AdaptiveBanner } from "../profile/AdaptiveBanner";
import { RecipeModal } from "./components/RecipeModal";
import { GroupMealModal } from "./components/GroupMealModal";
import { RenameGroupModal } from "./components/RenameGroupModal";
import { IngredientGramsModal } from "./components/IngredientGramsModal";
import { entryFromRecipe } from "./recipeActions";
import { sumFoodItems } from "../../shared/lib/foodItems";
import { QuickAddRows } from "./components/QuickAddRows";
import { computeHourlyGoTos, computeRecentItems, favoriteToQuickItem, type QuickItem } from "./quickAdd";
import {
  addEntry,
  addFavorite,
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
  const handleCopy = () => {
    const source = selectionMode && selectedCount > 0
      ? entries.filter((e) => selectedEntryIds.has(e.id))
      : entries;
    if (source.length === 0) return;
    setClipboard({ type: "nutrition", entries: source.map((e) => ({ ...e })) });
    if (selectionMode) setSelectionMode(false);
    openModal("paste");
  };

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [favoritesEditing, setFavoritesEditing] = useState(false);
  const [recipesEditing, setRecipesEditing] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [renameEntry, setRenameEntry] = useState<Entry | null>(null);
  // Which ingredient of which logged meal the grams sheet is editing.
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

  const patchForm = (patch: Partial<EntryFormState>) => setForm((f) => ({ ...f, ...patch }));

  const openManualAdd = () => {
    setForm(emptyEntryForm());
    setPendingBarcode(null);
    setEditingEntryId(null);
    setEntryOpen(true);
  };

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
      setForm(formFromLookup(result));
      showToast(result.source === "cache" ? "Producto guardado en este dispositivo" : "Producto encontrado");
    } else {
      // Nothing known anywhere — the user fills it in once, and the cache
      // makes every future scan of this barcode instant.
      setForm({ ...emptyEntryForm(), name: "" });
      showToast("No encontrado. Añádelo y lo recordaré.");
    }
    setEntryOpen(true);
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
      sodium: derived.sodium
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
          <button className="icon-btn" aria-label="Perfil" onClick={() => setProfileOpen(true)}>
            <GearIcon />
          </button>
          {/* Matches vanilla: the chip opens the calorie-range editor
              directly, a separate sheet from the profile modal. */}
          <button className="chip" onClick={() => setTargetOpen(true)}>
            {calorieTarget.min}–{calorieTarget.max} kcal
          </button>
        </div>
      </header>

      <WeekStrip />
      <BackupBanner />
      <AdaptiveBanner />

      <main className="content">
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
                  <button type="button" className="link-btn link-btn--muted" onClick={() => setSelectionMode(false)}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {entries.length > 0 ? (
            <>
              <EntryList
                entries={entries}
                dayKey={dayKey}
                onEdit={openEntryForEdit}
                onEditGroup={setRenameEntry}
                onEditItem={(e, index) => setGramsTarget({ entryId: e.id, index })}
              />
              {/*
                Multi-select has no visible control any more, so the gesture
                needs teaching. Shown only when there's actually more than
                one thing to select, and never while already selecting.
              */}
              {entries.length > 1 && !selectionMode && (
                <p
                  className="stat-note"
                  style={{ textAlign: "center", fontSize: 11, opacity: 0.55 }}
                >
                  Mantén pulsado para seleccionar · desliza para quitar
                </p>
              )}
            </>
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

          <DayTotals entries={entries} dayKey={dayKey} />
        </div>
      </main>

      <div className="action-bar">
        {selectionMode ? (
          // Adding food mid-selection makes no sense, so the add buttons
          // step aside for the one action the selection is for.
          <button
            className="btn btn--primary btn--block"
            disabled={selectedCount < 2}
            onClick={() => setGroupOpen(true)}
          >
            Agrupar ({selectedCount})
          </button>
        ) : (
          <>
            <button className="btn btn--primary btn--block" onClick={() => setScanOpen(true)}>
              <span className="btn-icon">
                <ScanIcon />
              </span>{" "}
              Escanear
            </button>
            <button className="btn btn--secondary btn--block" onClick={openManualAdd}>
              <span className="btn-icon">+</span> Añadir a mano
            </button>
          </>
        )}
      </div>

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
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleDetected} />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenWeight={() => {
          setProfileOpen(false);
          setWeightOpen(true);
        }}
      />
      <WeightModal
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        onBack={() => {
          setWeightOpen(false);
          setProfileOpen(true);
        }}
      />
      <TargetModal open={targetOpen} onClose={() => setTargetOpen(false)} />
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
