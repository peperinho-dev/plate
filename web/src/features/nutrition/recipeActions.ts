// Recipes: named collections of ingredients that log as one grouped meal.
import { useAppStore } from "../../shared/store";
import type { Entry, FoodItemBasis, Recipe } from "../../shared/store/types";
import { newId } from "../../shared/lib/id";
import { sumFoodItems } from "../../shared/lib/foodItems";

export function saveRecipe(name: string, items: FoodItemBasis[], existingId?: string) {
  useAppStore.setState((s) => {
    if (existingId) {
      return {
        recipes: s.recipes.map((r) =>
          r.id === existingId ? { ...r, name, items: items.map((i) => ({ ...i })) } : r
        )
      };
    }
    return {
      recipes: [...s.recipes, { id: newId(), name, items: items.map((i) => ({ ...i })), createdAt: Date.now() }]
    };
  });
}

export function removeRecipe(id: string) {
  useAppStore.setState((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
}

// Builds the logged entry for a recipe.
//
// The items are deep-cloned: a logged meal is a *snapshot*, not a live
// reference. Adjusting an ingredient's grams "just for today" must not
// rewrite the recipe, and editing the recipe later must not rewrite meals
// already logged.
export function entryFromRecipe(recipe: Recipe): Omit<Entry, "id"> {
  const items = recipe.items.map((it) => ({ ...it }));
  const totals = sumFoodItems(items);
  return {
    name: recipe.name,
    calories: totals.calories,
    qtyLabel: `${items.length} ingr.`,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    // The per-100g basis carries no micro data, so these stay zero rather
    // than inventing numbers.
    fiber: 0,
    sugar: 0,
    sodium: 0,
    items,
    sourceRecipeId: recipe.id,
    addedAt: Date.now()
  };
}

// True when a logged meal has drifted from the recipe it came from —
// which is what lets the row offer "update the recipe with these changes".
export function recipeItemsDiffer(a: FoodItemBasis[], b: FoodItemBasis[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((item, i) => {
    const other = b[i];
    return (
      !other ||
      item.name !== other.name ||
      item.grams !== other.grams ||
      item.kcalPer100 !== other.kcalPer100 ||
      item.proteinPer100 !== other.proteinPer100 ||
      item.fatPer100 !== other.fatPer100 ||
      item.carbsPer100 !== other.carbsPer100
    );
  });
}

// Pushes a logged meal's edited ingredients back onto its source recipe.
export function commitGroupToRecipe(entry: Entry) {
  if (!entry.sourceRecipeId || !entry.items) return;
  useAppStore.setState((s) => ({
    recipes: s.recipes.map((r) =>
      r.id === entry.sourceRecipeId ? { ...r, items: entry.items!.map((it) => ({ ...it })) } : r
    )
  }));
}
