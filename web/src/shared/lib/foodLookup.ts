// Barcode -> nutrition lookup.
//
// Open Food Facts stays the only remote source: it needs no API key (so
// nothing secret ships in the client bundle) and it has by far the best
// coverage of Spanish supermarket own-brands, which is exactly where the
// US-centric commercial APIs are weakest.
//
// The gap OFF leaves is closed locally instead: anything it doesn't know
// gets remembered per-barcode on this device (see barcodeCache), so a
// product only ever has to be typed in once.
import type { AppState } from "../store/types";

export interface LookupResult {
  name: string;
  kcalPer100: number | null;
  proteinPer100: number | null;
  fatPer100: number | null;
  carbsPer100: number | null;
  fiberPer100: number | null;
  sugarPer100: number | null;
  sodiumPer100: number | null;
  /** Where the data came from, so the UI can say so. */
  source: "cache" | "openfoodfacts";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Tries the Spanish-localized host first — it resolves product_name_es
// more reliably — then the global one.
const OFF_HOSTS = ["https://es.openfoodfacts.org", "https://world.openfoodfacts.org"];

export async function lookupFromOpenFoodFacts(barcode: string): Promise<LookupResult | null> {
  for (const host of OFF_HOSTS) {
    try {
      const res = await fetch(`${host}/api/v2/product/${encodeURIComponent(barcode)}.json`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status !== 1 || !data.product) continue;

      const p = data.product;
      const n = p.nutriments || {};
      const sodiumG = num(n.sodium_100g);
      return {
        name: p.product_name_es || p.product_name || p.generic_name || "Producto sin nombre",
        kcalPer100: num(n["energy-kcal_100g"]) ?? num(n["energy-kcal"]),
        proteinPer100: num(n.proteins_100g),
        fatPer100: num(n.fat_100g),
        carbsPer100: num(n.carbohydrates_100g),
        fiberPer100: num(n.fiber_100g),
        sugarPer100: num(n.sugars_100g),
        // OFF reports sodium in grams; the app stores milligrams.
        sodiumPer100: sodiumG === null ? null : sodiumG * 1000,
        source: "openfoodfacts"
      };
    } catch {
      // Try the next host rather than failing the whole lookup — one
      // host being unreachable shouldn't kill an otherwise good scan.
      continue;
    }
  }
  return null;
}

export function lookupFromCache(state: AppState, barcode: string): LookupResult | null {
  const hit = state.barcodeCache?.[barcode];
  if (!hit) return null;
  // Mapped explicitly rather than spread so the stored savedAt bookkeeping
  // never leaks into the lookup result.
  return {
    name: hit.name,
    kcalPer100: hit.kcalPer100,
    proteinPer100: hit.proteinPer100,
    fatPer100: hit.fatPer100,
    carbsPer100: hit.carbsPer100,
    fiberPer100: hit.fiberPer100,
    sugarPer100: hit.sugarPer100,
    sodiumPer100: hit.sodiumPer100,
    source: "cache"
  };
}

// Called after the user confirms a product that OFF didn't know (or that
// they corrected), so the next scan of the same barcode is instant and
// works offline.
export function rememberProduct(
  setState: (fn: (s: AppState) => Partial<AppState>) => void,
  barcode: string,
  product: Omit<LookupResult, "source">
) {
  setState((s) => ({
    barcodeCache: {
      ...s.barcodeCache,
      [barcode]: { ...product, savedAt: Date.now() }
    }
  }));
}

// Cache first: it's instant, works offline, and a product the user
// corrected by hand should always win over whatever OFF returns.
export async function lookupBarcode(state: AppState, barcode: string): Promise<LookupResult | null> {
  return lookupFromCache(state, barcode) ?? (await lookupFromOpenFoodFacts(barcode));
}
