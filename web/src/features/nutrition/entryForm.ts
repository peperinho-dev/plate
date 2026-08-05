// Entry-form state and the value derivation ported from
// readEntryFormValues() in app.js. Fields are kept as strings because
// they're controlled inputs; parsing happens once, on submit.
import type { Entry } from "../../shared/store/types";
import type { LookupResult } from "../../shared/lib/foodLookup";

export interface EntryFormState {
  name: string;
  time: string; // HH:MM, only used when editing an existing entry
  kcalPer100: string;
  grams: string;
  kcalTotal: string;
  proteinPer100: string;
  fatPer100: string;
  carbsPer100: string;
  fiberPer100: string;
  sugarPer100: string;
  sodiumPer100: string;
}

export function emptyEntryForm(): EntryFormState {
  return {
    name: "",
    time: "",
    kcalPer100: "",
    grams: "100",
    kcalTotal: "",
    proteinPer100: "",
    fatPer100: "",
    carbsPer100: "",
    fiberPer100: "",
    sugarPer100: "",
    sodiumPer100: ""
  };
}

const str = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(Math.round(n * 10) / 10);

export function formFromLookup(result: LookupResult): EntryFormState {
  return {
    ...emptyEntryForm(),
    name: result.name,
    kcalPer100: str(result.kcalPer100),
    proteinPer100: str(result.proteinPer100),
    fatPer100: str(result.fatPer100),
    carbsPer100: str(result.carbsPer100),
    fiberPer100: str(result.fiberPer100),
    sugarPer100: str(result.sugarPer100),
    sodiumPer100: str(result.sodiumPer100)
  };
}

// Rebuilds the per-100g basis from a stored entry's absolute totals so an
// already-logged item can be edited on the same terms it was created.
export function formFromEntry(entry: Entry): EntryFormState {
  const grams = entry.qtyLabel?.endsWith(" g") ? parseFloat(entry.qtyLabel) : NaN;
  const basisGrams = Number.isFinite(grams) && grams > 0 ? grams : 100;
  const per100 = (total: number) => str((total * 100) / basisGrams);
  const d = new Date(entry.addedAt);

  return {
    name: entry.name,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    grams: String(basisGrams),
    kcalPer100: per100(entry.calories),
    kcalTotal: "",
    proteinPer100: per100(entry.protein || 0),
    fatPer100: per100(entry.fat || 0),
    carbsPer100: per100(entry.carbs || 0),
    fiberPer100: per100(entry.fiber || 0),
    sugarPer100: per100(entry.sugar || 0),
    sodiumPer100: per100(entry.sodium || 0)
  };
}

export interface DerivedEntry {
  name: string;
  calories: number;
  qtyLabel: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  /** Per-100g basis, kept so the item stays proportionally re-scalable. */
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
}

// Returns null when the form can't produce a valid entry (no name, or no
// usable calorie figure) — same contract as the vanilla version.
export function deriveEntry(form: EntryFormState): DerivedEntry | null {
  const name = form.name.trim();
  if (!name) return null;

  const kcalTotal = parseFloat(form.kcalTotal);
  const kcalPer100Raw = parseFloat(form.kcalPer100);
  const grams = parseFloat(form.grams) || 100;

  let calories: number;
  let qtyLabel: string;
  let kcalPer100Basis: number;

  if (!isNaN(kcalTotal) && kcalTotal >= 0) {
    calories = kcalTotal;
    qtyLabel = "";
    // Direct-total entry ignores grams for the calorie figure itself, but
    // still derives a per-100g basis so the item can be re-scaled later.
    kcalPer100Basis = grams > 0 ? (kcalTotal * 100) / grams : kcalTotal;
  } else if (!isNaN(kcalPer100Raw) && kcalPer100Raw >= 0) {
    calories = (kcalPer100Raw * grams) / 100;
    qtyLabel = `${grams} g`;
    kcalPer100Basis = kcalPer100Raw;
  } else {
    return null;
  }

  const basis = (v: number) => (!isNaN(v) && v >= 0 ? v : 0);
  const scale = (v: number) => (basis(v) * grams) / 100;

  const proteinPer100Raw = parseFloat(form.proteinPer100);
  const fatPer100Raw = parseFloat(form.fatPer100);
  const carbsPer100Raw = parseFloat(form.carbsPer100);

  return {
    name,
    calories,
    qtyLabel,
    protein: scale(proteinPer100Raw),
    fat: scale(fatPer100Raw),
    carbs: scale(carbsPer100Raw),
    fiber: scale(parseFloat(form.fiberPer100)),
    sugar: scale(parseFloat(form.sugarPer100)),
    sodium: scale(parseFloat(form.sodiumPer100)),
    grams,
    kcalPer100: kcalPer100Basis,
    proteinPer100: basis(proteinPer100Raw),
    fatPer100: basis(fatPer100Raw),
    carbsPer100: basis(carbsPer100Raw)
  };
}
