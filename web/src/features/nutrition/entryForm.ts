// Entry-form state and the value derivation ported from
// readEntryFormValues() in app.js. Fields are kept as strings because
// they're controlled inputs; parsing happens once, on submit.
import type { Entry, FoodItemBasis } from "../../shared/store/types";
import { formatQuantity } from "../../shared/lib/quantity";
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
  /** Optional named unit, e.g. "huevo" weighing 55 g. */
  unitName: string;
  gramsPerUnit: string;
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
    sodiumPer100: "",
    unitName: "",
    gramsPerUnit: ""
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
  // The recorded basis is authoritative when there is one. Falling back to
  // parsing qtyLabel only works for entries labelled "250 g" — a direct
  // calorie total has no label to read, so it used to reopen as 100 g and
  // saving would then write that wrong basis back.
  const labelled = entry.qtyLabel?.endsWith(" g") ? parseFloat(entry.qtyLabel) : NaN;
  const basisGrams =
    entry.basis && entry.basis.grams > 0
      ? entry.basis.grams
      : Number.isFinite(labelled) && labelled > 0
        ? labelled
        : 100;
  // Micros have no per-100g basis of their own, so they're always derived
  // from the totals against whichever gram figure won above.
  const per100 = (total: number) => str((total * 100) / basisGrams);
  const d = new Date(entry.addedAt);

  return {
    name: entry.name,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    grams: String(basisGrams),
    kcalPer100: str(entry.basis?.kcalPer100 ?? (entry.calories * 100) / basisGrams),
    kcalTotal: "",
    proteinPer100: str(entry.basis?.proteinPer100 ?? ((entry.protein || 0) * 100) / basisGrams),
    fatPer100: str(entry.basis?.fatPer100 ?? ((entry.fat || 0) * 100) / basisGrams),
    carbsPer100: str(entry.basis?.carbsPer100 ?? ((entry.carbs || 0) * 100) / basisGrams),
    fiberPer100: per100(entry.fiber || 0),
    sugarPer100: per100(entry.sugar || 0),
    sodiumPer100: per100(entry.sodium || 0),
    unitName: entry.basis?.unitName ?? "",
    gramsPerUnit: entry.basis?.gramsPerUnit ? String(entry.basis.gramsPerUnit) : ""
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
  /**
   * The assembled basis, ready to store. Exposed as one object rather than
   * loose fields precisely because a caller rebuilding it by hand silently
   * drops whatever was added last — which is exactly how the unit went
   * missing, and how the basis itself went missing before that.
   */
  basis: FoodItemBasis;
}

// Returns null when the form can't produce a valid entry (no name, or no
// usable calorie figure) — same contract as the vanilla version.
export function deriveEntry(form: EntryFormState): DerivedEntry | null {
  const name = form.name.trim();
  if (!name) return null;

  const kcalTotal = parseFloat(form.kcalTotal);
  const kcalPer100Raw = parseFloat(form.kcalPer100);
  const grams = parseFloat(form.grams) || 100;

  const gramsPerUnitRaw = parseFloat(form.gramsPerUnit);
  const unitName = form.unitName.trim();
  // A unit needs both halves to mean anything: a name with no weight can't
  // be converted, and a weight with no name has nothing to call itself.
  const hasUnitDef = !!unitName && !isNaN(gramsPerUnitRaw) && gramsPerUnitRaw > 0;

  let calories: number;
  let isDirectTotal: boolean;
  let kcalPer100Basis: number;

  if (!isNaN(kcalTotal) && kcalTotal >= 0) {
    calories = kcalTotal;
    isDirectTotal = true;
    // Direct-total entry ignores grams for the calorie figure itself, but
    // still derives a per-100g basis so the item can be re-scaled later.
    kcalPer100Basis = grams > 0 ? (kcalTotal * 100) / grams : kcalTotal;
  } else if (!isNaN(kcalPer100Raw) && kcalPer100Raw >= 0) {
    calories = (kcalPer100Raw * grams) / 100;
    isDirectTotal = false;
    kcalPer100Basis = kcalPer100Raw;
  } else {
    return null;
  }

  const basis = (v: number) => (!isNaN(v) && v >= 0 ? v : 0);
  const scale = (v: number) => (basis(v) * grams) / 100;

  const proteinPer100Raw = parseFloat(form.proteinPer100);
  const fatPer100Raw = parseFloat(form.fatPer100);
  const carbsPer100Raw = parseFloat(form.carbsPer100);

  const itemBasis: FoodItemBasis = {
    name,
    grams,
    kcalPer100: kcalPer100Basis,
    proteinPer100: basis(proteinPer100Raw),
    fatPer100: basis(fatPer100Raw),
    carbsPer100: basis(carbsPer100Raw),
    ...(hasUnitDef ? { unitName, gramsPerUnit: gramsPerUnitRaw } : {})
  };

  return {
    name,
    calories,
    // A direct calorie total says nothing about how much it was, so it
    // gets no quantity label — same as before units existed.
    qtyLabel: isDirectTotal ? "" : formatQuantity(itemBasis),
    protein: scale(proteinPer100Raw),
    fat: scale(fatPer100Raw),
    carbs: scale(carbsPer100Raw),
    fiber: scale(parseFloat(form.fiberPer100)),
    sugar: scale(parseFloat(form.sugarPer100)),
    sodium: scale(parseFloat(form.sodiumPer100)),
    basis: itemBasis
  };
}
