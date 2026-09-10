// Copying a logged entry, in one place.
//
// This exists because the same bug has now happened three times: a write
// site enumerates Entry's fields by hand, a field gets added to Entry
// later, and the write site silently keeps writing the old shape. Twice
// it was `basis` being dropped, which leaves an entry that still *reads*
// "2 huevos" but has forgotten what a huevo weighs, so re-scaling it
// falls back to treating the logged amount as 100 g.
//
// Spreading the source would fix that but reintroduces what the hand
// copying was guarding against: a stray runtime key riding into stored
// data. So the field list stays explicit — and ENTRY_KEYS makes it
// exhaustive at compile time. Adding a field to Entry without adding it
// here fails to typecheck, because Record<keyof Entry, true> requires
// every key to be present.
import type { Entry } from "../store/types";

const ENTRY_KEYS: Record<keyof Entry, true> = {
  id: true,
  name: true,
  calories: true,
  qtyLabel: true,
  protein: true,
  fat: true,
  carbs: true,
  fiber: true,
  sugar: true,
  sodium: true,
  addedAt: true,
  items: true,
  recipeIngredients: true,
  sourceRecipeId: true,
  basis: true
};

/**
 * A deep copy of `entry` carrying every field Entry declares and nothing
 * else, with `overrides` applied last (a fresh id and timestamp, usually).
 */
export function cloneEntry(entry: Entry, overrides: Partial<Entry> = {}): Entry {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(ENTRY_KEYS)) {
    const value = (entry as unknown as Record<string, unknown>)[key];
    // Absent optional fields stay absent rather than becoming an explicit
    // undefined, so a copied entry serialises identically to the original.
    if (value !== undefined) copy[key] = structuredClone(value);
  }
  return { ...(copy as unknown as Entry), ...overrides };
}
