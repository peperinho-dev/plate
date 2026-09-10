// The "plato": food staged but not yet logged.
//
// Adding used to commit straight to the day, one item per trip through a
// ten-field form, so a four-item meal was four round trips with no chance
// to review. Staging lets a meal be assembled, corrected, then committed
// once — and makes "these were one meal" something you say while logging
// rather than repair afterwards with Agrupar.
import type { Entry, FoodItemBasis } from "../../shared/store/types";
import { scaleFoodItem } from "../../shared/lib/foodItems";
import { formatQuantity } from "../../shared/lib/quantity";
import { newId } from "../../shared/lib/id";
import type { FoodCandidate } from "./foodCandidates";
import type { SearchHit } from "../../shared/lib/foodLookup";

export interface PlateItem {
  id: string;
  name: string;
  qtyLabel: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  /** Present when the quantity is known, which is what allows re-scaling. */
  basis?: FoodItemBasis;
  /** Micros have no per-100g basis of their own, so they're kept here. */
  microsPer100?: { fiber: number; sugar: number; sodium: number };
  /** Set for a recipe, so the logged entry keeps its ingredient list. */
  items?: FoodItemBasis[];
  sourceRecipeId?: string;
}

function microsPer100From(item: {
  fiber: number;
  sugar: number;
  sodium: number;
}, grams: number) {
  const f = grams > 0 ? 100 / grams : 0;
  return { fiber: item.fiber * f, sugar: item.sugar * f, sodium: item.sodium * f };
}

// Stages something from your own data at the quantity you last had it —
// the whole point of remembering the basis.
export function plateItemFromCandidate(c: FoodCandidate): PlateItem {
  return {
    id: newId(),
    name: c.name,
    qtyLabel: c.qtyLabel,
    calories: c.calories,
    protein: c.protein,
    fat: c.fat,
    carbs: c.carbs,
    fiber: c.fiber,
    sugar: c.sugar,
    sodium: c.sodium,
    basis: c.basis,
    microsPer100: c.basis ? microsPer100From(c, c.basis.grams) : undefined,
    items: c.recipe ? c.recipe.items.map((i) => ({ ...i })) : undefined,
    sourceRecipeId: c.recipe?.id
  };
}

const DEFAULT_GRAMS = 100;

// A database hit has per-100g figures but no idea how much you ate, so it
// stages at 100 g — a starting point to adjust, not a guess at your meal.
export function plateItemFromSearchHit(hit: SearchHit): PlateItem {
  const basis: FoodItemBasis = {
    name: hit.name,
    grams: DEFAULT_GRAMS,
    kcalPer100: hit.kcalPer100 ?? 0,
    proteinPer100: hit.proteinPer100 ?? 0,
    fatPer100: hit.fatPer100 ?? 0,
    carbsPer100: hit.carbsPer100 ?? 0
  };
  const scaled = scaleFoodItem(basis);
  const factor = DEFAULT_GRAMS / 100;
  return {
    id: newId(),
    name: hit.name,
    qtyLabel: formatQuantity(basis),
    calories: scaled.calories,
    protein: scaled.protein,
    fat: scaled.fat,
    carbs: scaled.carbs,
    fiber: (hit.fiberPer100 ?? 0) * factor,
    sugar: (hit.sugarPer100 ?? 0) * factor,
    sodium: (hit.sodiumPer100 ?? 0) * factor,
    basis,
    microsPer100: {
      fiber: hit.fiberPer100 ?? 0,
      sugar: hit.sugarPer100 ?? 0,
      sodium: hit.sodiumPer100 ?? 0
    }
  };
}

export function rescalePlateItem(item: PlateItem, grams: number): PlateItem {
  if (!item.basis || !(grams > 0)) return item;
  const basis = { ...item.basis, grams };
  const scaled = scaleFoodItem(basis);
  const f = grams / 100;
  const micros = item.microsPer100;
  return {
    ...item,
    basis,
    // Keeps reading in units when the food has one: adjusting "2 huevos"
    // to 3 should say 3 huevos, not 165 g.
    qtyLabel: formatQuantity(basis),
    calories: scaled.calories,
    protein: scaled.protein,
    fat: scaled.fat,
    carbs: scaled.carbs,
    fiber: (micros?.fiber ?? 0) * f,
    sugar: (micros?.sugar ?? 0) * f,
    sodium: (micros?.sodium ?? 0) * f
  };
}

export function plateTotals(items: PlateItem[]) {
  return items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein: acc.protein + it.protein,
      fat: acc.fat + it.fat,
      carbs: acc.carbs + it.carbs
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

export function plateItemToEntry(item: PlateItem, addedAt: number): Omit<Entry, "id"> {
  return {
    name: item.name,
    calories: item.calories,
    qtyLabel: item.qtyLabel,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    fiber: item.fiber,
    sugar: item.sugar,
    sodium: item.sodium,
    addedAt,
    basis: item.basis,
    items: item.items,
    sourceRecipeId: item.sourceRecipeId
  };
}
