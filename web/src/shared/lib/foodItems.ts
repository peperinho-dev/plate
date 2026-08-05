// Per-100g "basis" scaling, ported from app.js. Any item carrying a
// grams + *Per100 basis can be proportionally re-scaled; this is what
// lets a logged meal's ingredient amounts be edited after the fact.
import type { FoodItemBasis } from "../store/types";

export interface ScaledFood {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export function scaleFoodItem(item: FoodItemBasis): ScaledFood {
  const factor = item.grams / 100;
  return {
    calories: item.kcalPer100 * factor,
    protein: (item.proteinPer100 || 0) * factor,
    fat: (item.fatPer100 || 0) * factor,
    carbs: (item.carbsPer100 || 0) * factor
  };
}

export function sumFoodItems(items: FoodItemBasis[]): ScaledFood {
  return items.reduce<ScaledFood>(
    (acc, it) => {
      const s = scaleFoodItem(it);
      acc.calories += s.calories;
      acc.protein += s.protein;
      acc.fat += s.fat;
      acc.carbs += s.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}
