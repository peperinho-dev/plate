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
  // Recipes are adjusted by expanding them, so they stay basis-less on
  // purpose; everything else gets one, reconstructed from its label when
  // the entry it came from predates the field.
  const basis = c.recipe ? undefined : c.basis ?? basisFromLogged(c);
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
    basis,
    microsPer100: basis ? microsPer100From(c, basis.grams) : undefined,
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
        : [basisFromLogged(item)]
  );
}

/**
 * A basis reconstructed for a plate item that never had one.
 *
 * `basis` is optional and genuinely absent from most real data: the
 * vanilla app never wrote it, so every entry carried over from there has
 * only a label — "40 g", "2 rebanadas", "1 plato". Without a basis there
 * is nothing to scale against, which meant those foods could not have
 * their amount adjusted at all: not on the plate, not in the portion
 * sheet, not as a recipe ingredient. For a log with years of history in
 * it, that is most of the food.
 *
 * The label is enough to rebuild one. "40 g" gives the real weight.
 * "2 rebanadas" gives a unit: the logged amount becomes the 100 g
 * reference and one rebanada is half of it, so the food reads and scales
 * in rebanadas. Anything unparseable falls back to the logged amount as
 * 100 g — the same convention migrateData uses for pre-grams recipes.
 *
 * Totals are identical in every branch. Only the unit the amount reads in
 * differs, and reading in the unit you logged beats reading in grams that
 * were never measured.
 */
export function basisFromLogged(item: {
  name: string;
  qtyLabel: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}): FoodItemBasis {
  const parsed = parseQtyLabel(item.qtyLabel);
  const grams = parsed?.unit ? 100 : parsed?.grams ?? 100;
  const per100 = 100 / grams;
  return {
    name: item.name,
    grams,
    kcalPer100: item.calories * per100,
    proteinPer100: item.protein * per100,
    fatPer100: item.fat * per100,
    carbsPer100: item.carbs * per100,
    ...(parsed?.unit
      ? { unitName: parsed.unit, gramsPerUnit: 100 / parsed.count }
      : {})
  };
}

/**
 * Reads "40 g", "2 rebanadas" or "1 plato" off a quantity label.
 *
 * Only the leading quantity is read. "150 g + 1 lata" is a compound the
 * app writes for grouped meals; treating its first number as the weight
 * keeps the totals exact and is the closest honest reading available.
 */
function parseQtyLabel(
  label: string
): { grams: number; unit?: string; count: number } | null {
  const match = /^\s*([\d.,]+)\s*([^\d\s+·]*)/.exec(label ?? "");
  if (!match) return null;
  const count = parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(count) || count <= 0) return null;
  const word = match[2].trim().toLowerCase();
  if (!word) return null;
  if (word === "g" || word === "gr" || word === "gramos") return { grams: count, count };
  return { grams: 100, unit: singularize(word), count };
}

/** Mirror of pluralize() in quantity.ts, for reading a label back in. */
function singularize(word: string): string {
  if (/ones$/i.test(word)) return word.slice(0, -4) + "ón";
  if (/ces$/i.test(word)) return word.slice(0, -3) + "z";
  if (/[^aeiou]es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}
