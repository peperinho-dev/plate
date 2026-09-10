// One searchable list of everything you can log from your own data:
// things you've eaten before, favourites, and recipes.
//
// Previously these were three fixed chip rows that typing didn't filter,
// plus a search box that only queried Open Food Facts over the network —
// so re-logging the yoghurt you eat every morning went through a global
// database. They're the same list ranked differently, not separate
// mechanisms.
import type { AppState, Favorite, FoodItemBasis, Recipe } from "../../shared/store/types";
import { sumFoodItems } from "../../shared/lib/foodItems";
import { foldText, matchRank } from "../../shared/lib/text";
import { computeHourlyGoTos, favoriteToQuickItem, type QuickItem } from "./quickAdd";

export type CandidateSource = "history" | "favorite" | "recipe";

export interface FoodCandidate {
  key: string;
  name: string;
  source: CandidateSource;
  calories: number;
  qtyLabel: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  /** Present when the quantity is known, so re-logging restores it. */
  basis?: FoodItemBasis;
  /** Set for recipes, so logging one keeps its ingredient list. */
  recipe?: Recipe;
  lastAddedAt: number;
  /** Habitually eaten around this hour — ranked to the top. */
  isGoTo: boolean;
}

function fromQuickItem(q: QuickItem, source: CandidateSource, isGoTo: boolean): FoodCandidate {
  return {
    key: `${source}:${q.key}`,
    name: q.name,
    source,
    calories: q.calories,
    qtyLabel: q.qtyLabel,
    protein: q.protein,
    fat: q.fat,
    carbs: q.carbs,
    fiber: q.fiber,
    sugar: q.sugar,
    sodium: q.sodium,
    basis: q.basis,
    lastAddedAt: q.lastAddedAt,
    isGoTo
  };
}

// Takes the three slices it needs rather than the whole AppState, so the
// caller can subscribe per-slice instead of re-rendering on every store
// change. `hour` decides which foods count as go-tos; pass the hour being
// logged to, not necessarily the current one.
export function buildFoodCandidates(
  days: AppState["days"],
  favorites: Favorite[],
  recipes: Recipe[],
  hour: number
): FoodCandidate[] {
  const goToKeys = new Set(computeHourlyGoTos(days, hour, 50).map((i) => i.key));

  const out: FoodCandidate[] = [];
  const seen = new Set<string>();

  // Favourites first so an explicitly starred food outranks the same name
  // picked up from history.
  favorites.forEach((f) => {
    const q = favoriteToQuickItem(f);
    const folded = foldText(q.name);
    seen.add(folded);
    out.push(fromQuickItem(q, "favorite", goToKeys.has(folded)));
  });

  recipes.forEach((r) => {
    const totals = sumFoodItems(r.items);
    const folded = foldText(r.name);
    if (seen.has(folded)) return;
    seen.add(folded);
    out.push({
      key: `recipe:${r.id}`,
      name: r.name,
      source: "recipe",
      calories: totals.calories,
      qtyLabel: `${r.items.length} ingr.`,
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      // Per-100g bases carry no micro data, so these stay zero rather than
      // inventing numbers.
      fiber: 0,
      sugar: 0,
      sodium: 0,
      recipe: r,
      lastAddedAt: r.createdAt,
      isGoTo: goToKeys.has(folded)
    });
  });

  // Everything ever logged. Uncapped — the whole point is that search
  // reaches all of it, not just a recent slice.
  const history = new Map<string, QuickItem>();
  Object.values(days).forEach((day) => {
    day.entries.forEach((e) => {
      const key = foldText(e.name);
      if (!key) return;
      const prev = history.get(key);
      if (!prev || e.addedAt > prev.lastAddedAt) {
        history.set(key, {
          key,
          name: e.name,
          calories: e.calories,
          qtyLabel: e.qtyLabel,
          protein: e.protein || 0,
          fat: e.fat || 0,
          carbs: e.carbs || 0,
          fiber: e.fiber || 0,
          sugar: e.sugar || 0,
          sodium: e.sodium || 0,
          count: (prev?.count ?? 0) + 1,
          lastAddedAt: e.addedAt,
          basis: e.basis
        });
      } else {
        prev.count += 1;
      }
    });
  });

  history.forEach((q, folded) => {
    if (seen.has(folded)) return;
    out.push(fromQuickItem(q, "history", goToKeys.has(folded)));
  });

  return out;
}

// Empty query: what you're most likely to want right now — go-tos for this
// hour, then most recent. Typing: matches only, prefix before substring,
// with the same go-to boost inside each band.
export function searchFoodCandidates(candidates: FoodCandidate[], query: string): FoodCandidate[] {
  const q = foldText(query);

  const ranked = candidates
    .map((c) => ({ c, rank: matchRank(c.name, q) }))
    .filter((r): r is { c: FoodCandidate; rank: number } => r.rank !== null);

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.c.isGoTo !== b.c.isGoTo) return a.c.isGoTo ? -1 : 1;
    return b.c.lastAddedAt - a.c.lastAddedAt;
  });

  return ranked.map((r) => r.c);
}
