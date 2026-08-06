// Ported verbatim (logic-for-logic) from defaultState()/migrateData() in
// app.js. This is the single migration authority for the app — Zustand's
// persist middleware only ever writes already-migrated state back out, it
// never runs its own version/migrate logic (see store/index.ts).
import type {
  AppState,
  Profile,
  CalorieTarget,
  MacroTargets,
  Adaptive,
  WorkoutGoal
} from "./types";

export const STORAGE_KEY = "tique-data-v2-react";
export const LEGACY_VANILLA_STORAGE_KEY = "tique-data-v1";
export const SCHEMA_VERSION = 9;
const MIGRATION_BAND_HALF_WIDTH = 75; // kcal, ± around the old single goalCalories number

export function defaultProfile(): Profile {
  return { sex: null, age: null, heightCm: null, activityLevel: null, goalType: null, rateKgPerWeek: null, updatedAt: null };
}

export function defaultCalorieTarget(): CalorieTarget {
  return { mode: "calculated", min: 1900, max: 2100, calculatedMin: null, calculatedMax: null, calculatedAt: null };
}

export function defaultMacroTargets(): MacroTargets {
  return { proteinMin: null, proteinMax: null, fatMin: null, fatMax: null, carbsMin: null, carbsMax: null, calculatedAt: null };
}

export function defaultAdaptive(): Adaptive {
  return { lastCheckedAt: null, suggestion: null };
}

export function defaultWorkoutGoal(): WorkoutGoal {
  return { weeklySessions: 4, restSeconds: 90 };
}

export function defaultState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    days: {},
    profile: defaultProfile(),
    weightLog: [],
    calorieTarget: defaultCalorieTarget(),
    macroTargets: defaultMacroTargets(),
    adaptive: defaultAdaptive(),
    workouts: {},
    workoutGoal: defaultWorkoutGoal(),
    favorites: [],
    recipes: [],
    routines: [],
    timers: [],
    onboardingShown: false,
    lastExportedAt: null,
    analyticsLayout: null,
    barcodeCache: {}
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV1toV2(old: any): Record<string, any> {
  const legacyGoal = (typeof old.goalCalories === "number" && old.goalCalories > 0) ? Math.round(old.goalCalories) : 2000;
  return {
    schemaVersion: 2,
    days: old.days || {},
    profile: defaultProfile(),
    weightLog: [],
    calorieTarget: {
      mode: "manual",
      min: Math.max(0, legacyGoal - MIGRATION_BAND_HALF_WIDTH),
      max: legacyGoal + MIGRATION_BAND_HALF_WIDTH,
      calculatedMin: null,
      calculatedMax: null,
      calculatedAt: null
    },
    onboardingShown: false
  };
}

export function migrateData(parsed: unknown): AppState {
  if (!parsed || typeof parsed !== "object") return defaultState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = parsed as Record<string, any>;
  if (!data.schemaVersion || data.schemaVersion < 2) data = migrateV1toV2(data);
  data.schemaVersion = SCHEMA_VERSION;
  if (!data.days) data.days = {};
  if (!data.profile) data.profile = defaultProfile();
  if (!data.weightLog) data.weightLog = [];
  if (!data.calorieTarget) data.calorieTarget = defaultCalorieTarget();
  if (!data.macroTargets) data.macroTargets = defaultMacroTargets();
  if (!data.adaptive) data.adaptive = defaultAdaptive();
  if (!data.workouts) data.workouts = {};
  if (!data.workoutGoal) data.workoutGoal = defaultWorkoutGoal();
  if (typeof data.workoutGoal.restSeconds !== "number") data.workoutGoal.restSeconds = 90;
  if (!data.favorites) data.favorites = [];
  if (!data.recipes) data.recipes = [];
  data.recipes.forEach((recipe: { items: Array<Record<string, any>> }) => {
    recipe.items.forEach((item) => {
      // Older recipes stored only the already-scaled totals with no grams
      // basis at all. Treat whatever was originally logged as the "100g"
      // reference point so proportional re-scaling has something sound to
      // scale from — it's the only anchor available for pre-existing data.
      if (typeof item.grams !== "number") {
        item.grams = 100;
        item.kcalPer100 = item.calories;
        item.proteinPer100 = item.protein || 0;
        item.fatPer100 = item.fat || 0;
        item.carbsPer100 = item.carbs || 0;
      }
    });
  });
  if (!data.routines) data.routines = [];
  if (!data.timers) data.timers = [];
  if (typeof data.onboardingShown !== "boolean") data.onboardingShown = false;
  if (typeof data.lastExportedAt !== "number") data.lastExportedAt = null;
  if (!Array.isArray(data.analyticsLayout)) data.analyticsLayout = null;
  // Additive field — no SCHEMA_VERSION bump needed, matching how the
  // vanilla app introduced optional fields like lastExportedAt.
  if (!data.barcodeCache || typeof data.barcodeCache !== "object") data.barcodeCache = {};

  // An earlier build of the React port stored timers as a single flat
  // { seconds } instead of app.js's { intervals: [...] }, and logged runs
  // as { seconds, addedAt } instead of { totalSeconds, completedAt }.
  // Normalise both so data written by either app opens in the other.
  data.timers = (Array.isArray(data.timers) ? data.timers : []).map((t: Record<string, unknown>) => {
    const intervals = Array.isArray(t.intervals)
      ? t.intervals
      : [{ name: String(t.name ?? "Intervalo"), seconds: Number(t.seconds) || 60 }];
    return {
      id: t.id,
      name: t.name,
      category: t.category === "stretch" ? "stretch" : "warmup",
      intervals,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now()
    };
  });

  Object.values(data.workouts as Record<string, Record<string, unknown>>).forEach((day) => {
    if (!Array.isArray(day.timerLogs)) return;
    day.timerLogs = day.timerLogs.map((l: Record<string, unknown>) => ({
      id: l.id ?? `${l.completedAt ?? l.addedAt ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: l.name ?? (l.category === "stretch" ? "Estiramientos" : "Calentamiento"),
      category: l.category === "stretch" ? "stretch" : "warmup",
      totalSeconds: typeof l.totalSeconds === "number" ? l.totalSeconds : Number(l.seconds) || 0,
      completedAt: typeof l.completedAt === "number" ? l.completedAt : Number(l.addedAt) || Date.now()
    }));
  });

  // app.js writes recipes with createdAt; an earlier React build used
  // addedAt. Keep createdAt as the single name.
  data.recipes = (Array.isArray(data.recipes) ? data.recipes : []).map((r: Record<string, unknown>) => ({
    ...r,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Number(r.addedAt) || Date.now()
  }));
  data.routines = (Array.isArray(data.routines) ? data.routines : []).map((r: Record<string, unknown>) => ({
    ...r,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now()
  }));
  return data as AppState;
}

// Reads the initial store state: adopts the vanilla app's existing
// tique-data-v1 blob once (non-destructively — v1 is never written to
// from here) if this browser has no v2-react data yet, otherwise loads
// v2-react directly. Both paths go through the same migrateData().
export function loadInitialState(): AppState {
  try {
    const ownRaw = localStorage.getItem(STORAGE_KEY);
    if (ownRaw) {
      // Our own key is written by persist, which wraps the data in a
      // { state, version } envelope — migrateData expects the bare state,
      // so the envelope has to come off first. (Persist would hydrate over
      // a wrong result here anyway, but relying on that is a trap.)
      const parsed = JSON.parse(ownRaw);
      const bare = parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
      return migrateData(bare);
    }

    const legacyRaw = localStorage.getItem(LEGACY_VANILLA_STORAGE_KEY);
    if (legacyRaw) return migrateData(JSON.parse(legacyRaw));

    return defaultState();
  } catch (e) {
    console.error("Error loading data", e);
    return defaultState();
  }
}
