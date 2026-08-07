// Entry mutations. Deliberately standalone functions over
// useAppStore.setState rather than methods on the store type — AppState
// stays pure serializable data, so what persist() writes is byte-for-byte
// the same schema shape the vanilla app reads.
import { useAppStore } from "../../shared/store";
import type { AppState, Entry, Favorite, FoodItemBasis } from "../../shared/store/types";
import { newId } from "../../shared/lib/id";
import { rebaseTimeToDay } from "../../shared/lib/date";
import { sumFoodItems } from "../../shared/lib/foodItems";
import type { EntryFormState } from "./entryForm";

function updateDay(state: AppState, dayKey: string, entries: Entry[]): Partial<AppState> {
  return {
    days: {
      ...state.days,
      [dayKey]: { ...state.days[dayKey], entries }
    }
  };
}

export function deleteEntry(dayKey: string, entryId: string) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    return updateDay(s, dayKey, day.entries.filter((e) => e.id !== entryId));
  });
}

// Puts a deleted entry back where it was, so undo restores list order
// rather than appending it to the end.
export function restoreEntry(dayKey: string, entry: Entry, index: number) {
  useAppStore.setState((s) => {
    const existing = s.days[dayKey]?.entries ?? [];
    const next = existing.slice();
    next.splice(Math.min(index, next.length), 0, entry);
    return updateDay(s, dayKey, next);
  });
}

export function addEntry(dayKey: string, entry: Omit<Entry, "id">) {
  useAppStore.setState((s) => {
    const existing = s.days[dayKey]?.entries ?? [];
    return updateDay(s, dayKey, [...existing, { ...entry, id: newId() }]);
  });
}

export function updateEntry(dayKey: string, entryId: string, patch: Partial<Entry>) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    return updateDay(
      s,
      dayKey,
      day.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e))
    );
  });
}

// Teaches this device a barcode -> product mapping from whatever the user
// confirmed in the entry form. Runs on every scanned add, so a correction
// to bad Open Food Facts data sticks too, not just brand-new products.
export function rememberScannedProduct(barcode: string, form: EntryFormState) {
  const numOrNull = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  useAppStore.setState((s) => ({
    barcodeCache: {
      ...s.barcodeCache,
      [barcode]: {
        name: form.name.trim(),
        kcalPer100: numOrNull(form.kcalPer100),
        proteinPer100: numOrNull(form.proteinPer100),
        fatPer100: numOrNull(form.fatPer100),
        carbsPer100: numOrNull(form.carbsPer100),
        fiberPer100: numOrNull(form.fiberPer100),
        sugarPer100: numOrNull(form.sugarPer100),
        sodiumPer100: numOrNull(form.sodiumPer100),
        savedAt: Date.now()
      }
    }
  }));
}

export function addFavorite(fav: Omit<Favorite, "id" | "addedAt">) {
  useAppStore.setState((s) => {
    // Same name twice would just clutter the row — treat it as a no-op.
    const exists = s.favorites.some((f) => f.name.trim().toLowerCase() === fav.name.trim().toLowerCase());
    if (exists) return {};
    return { favorites: [...s.favorites, { ...fav, id: newId(), addedAt: Date.now() }] };
  });
}

export function removeFavorite(id: string) {
  useAppStore.setState((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) }));
}

export type PasteTimeMode = "keep" | "now";

// Ported from pasteEntriesToDay() in app.js. "keep" rebases each entry's
// original time-of-day onto the target date (Hoy/Mañana/Elegir día…);
// "now" stamps every entry with the current moment (Ahora).
//
// Fields are copied explicitly rather than spread so a stray runtime key
// can never leak into stored data — the same discipline the vanilla
// version settled on after it silently dropped fiber/sugar/sodium.
export function pasteEntriesToDay(entries: Entry[], targetDayKey: string, timeMode: PasteTimeMode) {
  useAppStore.setState((s) => {
    const existing = s.days[targetDayKey]?.entries ?? [];
    const copies: Entry[] = entries.map((entry) => {
      const copy: Entry = {
        id: newId(),
        name: entry.name,
        calories: entry.calories,
        qtyLabel: entry.qtyLabel || "",
        protein: entry.protein || 0,
        fat: entry.fat || 0,
        carbs: entry.carbs || 0,
        fiber: entry.fiber || 0,
        sugar: entry.sugar || 0,
        sodium: entry.sodium || 0,
        addedAt: timeMode === "now" ? Date.now() : rebaseTimeToDay(entry.addedAt, targetDayKey)
      };
      if (entry.recipeIngredients) copy.recipeIngredients = entry.recipeIngredients.slice();
      if (entry.items) copy.items = entry.items.map((it) => ({ ...it }));
      if (entry.sourceRecipeId) copy.sourceRecipeId = entry.sourceRecipeId;
      return copy;
    });
    return updateDay(s, targetDayKey, [...existing, ...copies]);
  });
}

// Recomputes a grouped meal's totals from its ingredient list — used
// after an ingredient is removed or re-scaled.
function recomputeGroupEntry(entry: Entry): Entry {
  const items = entry.items ?? [];
  const totals = sumFoodItems(items);
  return {
    ...entry,
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    qtyLabel: `${items.length} ingr.`
  };
}

// Removing the last ingredient removes the whole meal entry — an empty
// group row would show 0 kcal with nothing in it.
export function deleteGroupItem(dayKey: string, entryId: string, itemIndex: number) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    const entry = day.entries.find((e) => e.id === entryId);
    if (!entry?.items) return {};

    const items = entry.items.filter((_, i) => i !== itemIndex);
    if (items.length === 0) {
      return updateDay(s, dayKey, day.entries.filter((e) => e.id !== entryId));
    }
    return updateDay(
      s,
      dayKey,
      day.entries.map((e) => (e.id === entryId ? recomputeGroupEntry({ ...e, items }) : e))
    );
  });
}

export function updateGroupItem(dayKey: string, entryId: string, itemIndex: number, patch: Partial<FoodItemBasis>) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    const entry = day.entries.find((e) => e.id === entryId);
    if (!entry?.items) return {};
    const items = entry.items.map((it, i) => (i === itemIndex ? { ...it, ...patch } : it));
    return updateDay(
      s,
      dayKey,
      day.entries.map((e) => (e.id === entryId ? recomputeGroupEntry({ ...e, items }) : e))
    );
  });
}

// --- Grouping ---------------------------------------------------------

// Converts an already-logged flat entry into a re-scalable food item,
// using the same "treat the logged amount as the 100g reference" fallback
// applied everywhere else an item lacks an explicit basis.
function entryToFoodItem(entry: Entry): FoodItemBasis {
  return {
    name: entry.name,
    grams: 100,
    kcalPer100: entry.calories,
    proteinPer100: entry.protein || 0,
    fatPer100: entry.fat || 0,
    carbsPer100: entry.carbs || 0
  };
}

// Collapses several logged entries into one "meal" entry. Returns the new
// entry's id, or null if there was nothing to group.
export function groupEntries(
  dayKey: string,
  entryIds: Set<string>,
  name: string,
  alsoSaveRecipe: boolean
): string | null {
  if (entryIds.size < 2) return null;
  const groupedId = newId();
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    const selected = day.entries.filter((e) => entryIds.has(e.id));
    if (selected.length < 2) return {};

    // An already-grouped entry contributes its own items rather than being
    // re-wrapped as one opaque ingredient, so grouping never nests.
    const items = selected.flatMap((e) =>
      e.items ? e.items.map((it) => ({ ...it })) : [entryToFoodItem(e)]
    );
    const totals = sumFoodItems(items);
    const grouped: Entry = {
      id: groupedId,
      name,
      calories: totals.calories,
      qtyLabel: `${items.length} ingr.`,
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      // The per-100g basis carries no micro data, so these stay zero
      // rather than inventing numbers.
      fiber: 0,
      sugar: 0,
      sodium: 0,
      items,
      // Keeps the meal in the hour group its earliest component was in,
      // instead of jumping to "now".
      addedAt: Math.min(...selected.map((e) => e.addedAt))
    };

    const recipes = s.recipes.slice();
    if (alsoSaveRecipe) {
      const recipeId = newId();
      recipes.push({ id: recipeId, name, items: items.map((it) => ({ ...it })), createdAt: Date.now() });
      grouped.sourceRecipeId = recipeId;
    }

    const remaining = day.entries.filter((e) => !entryIds.has(e.id));
    return { ...updateDay(s, dayKey, [...remaining, grouped]), recipes };
  });
  return groupedId;
}

// Renaming only ever touches the logged entry, never the recipe it came
// from — the recipe's own name is a separate, deliberate decision (via
// "Actualizar receta"), the same split grams edits follow.
export function renameGroupEntry(dayKey: string, entryId: string, name: string, time: string | null) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    return updateDay(
      s,
      dayKey,
      day.entries.map((e) => {
        if (e.id !== entryId) return e;
        let addedAt = e.addedAt;
        if (time) {
          const [h, m] = time.split(":").map(Number);
          const d = new Date(addedAt);
          d.setHours(h, m, 0, 0);
          addedAt = d.getTime();
        }
        return { ...e, name, addedAt };
      })
    );
  });
}

export function setGroupItemGrams(dayKey: string, entryId: string, itemIndex: number, grams: number) {
  useAppStore.setState((s) => {
    const day = s.days[dayKey];
    if (!day) return {};
    return updateDay(
      s,
      dayKey,
      day.entries.map((e) => {
        if (e.id !== entryId || !e.items) return e;
        const items = e.items.map((it, i) => (i === itemIndex ? { ...it, grams } : it));
        return recomputeGroupEntry({ ...e, items });
      })
    );
  });
}
