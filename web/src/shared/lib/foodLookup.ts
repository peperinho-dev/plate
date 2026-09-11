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
import { foldText, wordMatchRank } from "./text";

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

export interface SearchHit extends Omit<LookupResult, "source"> {
  id: string;
  /** A natural serving, when the source knows one. */
  unitName?: string;
  gramsPerUnit?: number;
}

// Free-text product search.
//
// Searching "azucar" used to return twelve products that advertise having
// *no* sugar — "Coca-Cola zero azúcar", "Granola baja en azúcares" — and
// never once returned azúcar, even though OFF holds entries for "azúcar
// blanco" with correct figures. Two causes, both fixed here.
//
// 1. No relevance model. OFF's `cgi/search.pl` does substring matching, so
//    a name that *negates* the term scores exactly like one that is the
//    term. The results are re-ranked on arrival: exact prefix first, then
//    substring, and anything reading as a negation ("sin", "0%", "light",
//    "50% menos") sinks two bands. They sink rather than vanish — someone
//    looking for a zero-sugar drink still finds it, one scroll down.
//    Re-ranking only works if there is something to rank, so the request
//    asks for five times what it shows and lets the filters take their cut
//    from that.
//
// 2. The endpoint is flaky. It answers with an HTML error page often
//    enough that `res.json()` throwing is a normal outcome — measured from
//    the app, three of four consecutive calls failed and the fourth
//    returned 2,670 matches. That surfaced as a bare "Sin resultados",
//    i.e. a working search indistinguishable from a broken one. Hence the
//    retries.
//
// Why not `search.openfoodfacts.org`, OFF's newer Elasticsearch search:
// it ranks far better (it puts real azúcar on page one unaided) and is
// typo-tolerant, but it sends no `Access-Control-Allow-Origin` header, so
// a browser cannot call it at all. `/api/v2/search` does send CORS but
// ignores `search_terms` — it returned the whole 371,110-product database
// for any query. Legacy is the only search endpoint reachable from a
// client-side app today. Worth re-testing if OFF ever adds CORS.
const SEARCH_URL = "https://es.openfoodfacts.org/cgi/search.pl";
const OFF_FIELDS = "code,product_name,product_name_es,generic_name,nutriments";

const ATTEMPT_DELAYS = [400, 900, 1800];

// "0 %" and "50 % menos" are matched without a trailing word boundary:
// there is none after "%", which silently killed an earlier version of
// this rule and let every 0%-sugar drink keep its rank.
const NEGATION =
  /\b(sin|cero|zero|light|ligera|ligero|baja|bajo|reducida|reducido|desnatada|desnatado|menos)\b|\d\s*%/i;

function offRelevance(name: string, folded: string): number {
  // Same three bands the basics use, plus a fourth for results that don't
  // contain the term at all — OFF matches on ingredients and categories
  // too, so a query can come back with names that never mention it.
  const base = wordMatchRank(name, folded) ?? 3;
  return base + (NEGATION.test(name) ? 3 : 0);
}

function mapProduct(raw: unknown, i: number): SearchHit {
  const p = raw as {
    code?: string;
    product_name_es?: string;
    product_name?: string;
    generic_name?: string;
    nutriments?: Record<string, unknown>;
  };
  const n = p.nutriments ?? {};
  const sodiumG = num(n.sodium_100g);
  return {
    id: p.code || `${i}`,
    name: p.product_name_es || p.product_name || p.generic_name || "",
    kcalPer100: num(n["energy-kcal_100g"]) ?? num(n["energy-kcal"]),
    proteinPer100: num(n.proteins_100g),
    fatPer100: num(n.fat_100g),
    carbsPer100: num(n.carbohydrates_100g),
    fiberPer100: num(n.fiber_100g),
    sugarPer100: num(n.sugars_100g),
    sodiumPer100: sodiumG === null ? null : sodiumG * 1000
  };
}

export async function searchFoods(query: string, limit = 12): Promise<SearchHit[]> {
  const term = query.trim();
  if (!term) return [];
  const folded = foldText(term);
  const url =
    `${SEARCH_URL}?search_terms=${encodeURIComponent(term)}` +
    `&search_simple=1&action=process&json=1&page_size=${limit * 5}&fields=${OFF_FIELDS}`;

  let products: unknown[] | null = null;
  for (let attempt = 0; attempt <= ATTEMPT_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, ATTEMPT_DELAYS[attempt - 1]));
    }
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.products)) {
        products = data.products;
        break;
      }
    } catch {
      // An HTML error page, or the network. Either way, try again.
      continue;
    }
  }
  if (!products) return [];

  return products
    .map(mapProduct)
    // A result with no name or no calories can't be logged usefully, and
    // OFF returns plenty of half-filled entries.
    .filter((r) => r.name && r.kcalPer100 !== null)
    .map((r) => ({ r, rank: offRelevance(r.name, folded) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((x) => x.r);
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
