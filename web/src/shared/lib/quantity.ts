// Quantities in units — "2 huevos", "1 tostada" — on top of grams.
//
// Grams stay the single source of truth: a unit is just a named
// multiplier, so every existing calculation (scaling, totals, charts,
// grouped meals) keeps working untouched and a food without a unit
// behaves exactly as before. The unit only changes how a quantity is
// entered and displayed.
import type { FoodItemBasis } from "../store/types";

// Spanish pluralisation, good enough for food units. Deliberately a
// heuristic rather than a dictionary: the user types the singular, and
// the cases that actually come up here are regular.
export function pluralize(unit: string, n: number): string {
  if (Math.abs(n) === 1) return unit;
  const u = unit.trim();
  if (!u) return u;
  // ración → raciones (the accent disappears once the stress moves)
  if (/ón$/i.test(u)) return u.slice(0, -2) + "ones";
  // vez → veces
  if (/z$/i.test(u)) return u.slice(0, -1) + "ces";
  // Ends in an unstressed vowel: just add s. Anything else takes -es.
  if (/[aeiou]$/i.test(u)) return u + "s";
  return u + "es";
}

// Trims a pointless decimal: 2 rather than 2.0, but 1.5 kept.
function formatCount(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

export function hasUnit(basis?: FoodItemBasis | null): boolean {
  return !!basis?.unitName && !!basis.gramsPerUnit && basis.gramsPerUnit > 0;
}

export function unitsFromGrams(grams: number, basis: FoodItemBasis): number {
  return basis.gramsPerUnit && basis.gramsPerUnit > 0 ? grams / basis.gramsPerUnit : 0;
}

export function gramsFromUnits(units: number, basis: FoodItemBasis): number {
  return units * (basis.gramsPerUnit ?? 0);
}

// How a quantity reads in the log. Falls back to grams whenever there's
// no unit, which is every food logged before this existed and everything
// app.js wrote.
export function formatQuantity(basis?: FoodItemBasis | null): string {
  if (!basis) return "";
  if (!hasUnit(basis)) return `${Math.round(basis.grams)} g`;
  const n = unitsFromGrams(basis.grams, basis);
  return `${formatCount(n)} ${pluralize(basis.unitName!, n)}`;
}
