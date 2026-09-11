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
// A basic food that knows a natural serving stages at one of those
// instead: "1 plátano" is a better opening guess than 100 g of banana,
// and the grams underneath stay authoritative either way.
export function plateItemFromSearchHit(hit: SearchHit): PlateItem {
  const grams = hit.gramsPerUnit && hit.gramsPerUnit > 0 ? hit.gramsPerUnit : DEFAULT_GRAMS;
  const basis: FoodItemBasis = {
    name: hit.name,
    grams,
    kcalPer100: hit.kcalPer100 ?? 0,
    proteinPer100: hit.proteinPer100 ?? 0,
    fatPer100: hit.fatPer100 ?? 0,
    carbsPer100: hit.carbsPer100 ?? 0,
    unitName: hit.unitName,
    gramsPerUnit: hit.gramsPerUnit
  };
  const scaled = scaleFoodItem(basis);
  const factor = grams / 100;
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

/**
 * A staged recipe, broken back into its ingredients.
 *
 * A recipe lands on the plate as one row with no per-100g basis of its
 * own, so "toca para ajustar" did nothing on it — the one thing you
 * actually want when today's portion is bigger than the recipe's. Rather
 * than invent a scaling rule for the whole meal, it becomes the
 * ingredients it is made of, each with its own basis and therefore each
 * adjustable with the machinery that already works. MacroFactor calls
 * this exploding a recipe, and offers it for the same reason: changing an
 * amount today shouldn't mean editing the recipe for every future day.
 */
export function explodePlateItem(item: PlateItem): PlateItem[] {
  if (!item.items || item.items.length === 0) return [item];
  return item.items.map((basis) => {
    const scaled = scaleFoodItem(basis);
    return {
      id: newId(),
      name: basis.name,
      qtyLabel: formatQuantity(basis),
      calories: scaled.calories,
      protein: scaled.protein,
      fat: scaled.fat,
      carbs: scaled.carbs,
      // Ingredient bases carry no micro data, so these stay zero rather
      // than splitting the meal's totals by a rule nobody chose.
      fiber: 0,
      sugar: 0,
      sodium: 0,
      basis: { ...basis },
      microsPer100: { fiber: 0, sugar: 0, sodium: 0 }
    };
  });
}

/** The plate as recipe ingredients, for saving a combination you repeat. */
export function plateToRecipeItems(plate: PlateItem[]): FoodItemBasis[] {
  return plate.flatMap((item) =>
    item.items && item.items.length > 0
      ? item.items.map((i) => ({ ...i }))
      : item.basis
        ? [{ ...item.basis }]
        : [basisWithoutBasis(item)]
  );
}

/**
 * An ingredient for a plate item that has no basis of its own.
 *
 * `basis` is optional and genuinely absent on a lot of real data: the
 * vanilla app never wrote it, so every entry imported from there has only
 * a label like "40 g". Where that label names grams, it is used — the
 * recipe then holds the real weight and per-100g figures derived from it.
 * Where it doesn't ("1 plato"), the logged amount becomes the 100 g
 * reference, which is the same fallback migrateData uses for pre-grams
 * recipes. Either way the totals are preserved exactly; only the unit the
 * recipe reads in differs.
 */
function basisWithoutBasis(item: PlateItem): FoodItemBasis {
  const grams = gramsFromLabel(item.qtyLabel) ?? 100;
  const per100 = 100 / grams;
  return {
    name: item.name,
    grams,
    kcalPer100: item.calories * per100,
    proteinPer100: item.protein * per100,
    fatPer100: item.fat * per100,
    carbsPer100: item.carbs * per100
  };
}

/** Grams named by a label like "40 g" or "150 g + 1 lata"; null otherwise. */
function gramsFromLabel(label: string): number | null {
  const match = /^\s*([\d.,]+)\s*g\b/.exec(label ?? "");
  if (!match) return null;
  const value = parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
