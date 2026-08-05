// Quick-add sources for the entry sheet, ported from the tally helpers in
// app.js. Deduplicated by lowercased name, always carrying the *most
// recent* version of an item's numbers — if you corrected a food's macros
// last time, the quick-add should reflect the correction.
import type { AppState, Entry, Favorite } from "../../shared/store/types";

export interface QuickItem {
  key: string;
  name: string;
  calories: number;
  qtyLabel: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  count: number;
  lastAddedAt: number;
}

function tallyEntries(days: AppState["days"], matches: (e: Entry) => boolean): Map<string, QuickItem> {
  const tally = new Map<string, QuickItem>();
  Object.values(days).forEach((day) => {
    day.entries.forEach((e) => {
      if (!matches(e)) return;
      const key = e.name.trim().toLowerCase();
      if (!key) return;
      const existing = tally.get(key);
      if (existing) {
        existing.count += 1;
        if (e.addedAt > existing.lastAddedAt) {
          Object.assign(existing, {
            lastAddedAt: e.addedAt,
            name: e.name,
            calories: e.calories,
            qtyLabel: e.qtyLabel,
            protein: e.protein,
            fat: e.fat,
            carbs: e.carbs,
            fiber: e.fiber,
            sugar: e.sugar,
            sodium: e.sodium
          });
        }
      } else {
        tally.set(key, {
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
          count: 1,
          lastAddedAt: e.addedAt
        });
      }
    });
  });
  return tally;
}

// Most recently logged distinct foods.
export function computeRecentItems(days: AppState["days"], limit = 8): QuickItem[] {
  return Array.from(tallyEntries(days, () => true).values())
    .sort((a, b) => b.lastAddedAt - a.lastAddedAt)
    .slice(0, limit);
}

// What you usually eat around this time of day — a ±1 hour window, which
// is enough to separate breakfast from dinner without being so tight that
// a slightly late meal misses.
export function computeHourlyGoTos(days: AppState["days"], hour: number, limit = 8): QuickItem[] {
  const inWindow = (e: Entry) => {
    const h = new Date(e.addedAt).getHours();
    const diff = Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour));
    return diff <= 1;
  };
  return Array.from(tallyEntries(days, inWindow).values())
    .filter((i) => i.count > 1) // one-offs aren't habits
    .sort((a, b) => b.count - a.count || b.lastAddedAt - a.lastAddedAt)
    .slice(0, limit);
}

export function favoriteToQuickItem(f: Favorite): QuickItem {
  return {
    key: f.id,
    name: f.name,
    calories: f.calories,
    qtyLabel: f.qtyLabel,
    protein: f.protein || 0,
    fat: f.fat || 0,
    carbs: f.carbs || 0,
    fiber: f.fiber || 0,
    sugar: f.sugar || 0,
    sodium: f.sodium || 0,
    count: 0,
    lastAddedAt: f.addedAt
  };
}
