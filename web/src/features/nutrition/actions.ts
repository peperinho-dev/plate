// Entry mutations. Deliberately standalone functions over
// useAppStore.setState rather than methods on the store type — AppState
// stays pure serializable data, so what persist() writes is byte-for-byte
// the same schema shape the vanilla app reads.
import { useAppStore } from "../../shared/store";
import type { AppState, Entry, FoodItemBasis } from "../../shared/store/types";
import { newId } from "../../shared/lib/id";
import { sumFoodItems } from "../../shared/lib/foodItems";

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
