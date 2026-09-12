// Ported from the shape defaultState()/migrateData() build and maintain in
// app.js. Kept as one file since the vanilla app treats this as one
// cohesive blob too — splitting it up would just add indirection without
// a real boundary to justify it.

export interface FoodItemBasis {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  // An optional named multiplier over grams — "huevo", 55 — so a quantity
  // can be entered and read as "2 huevos". Grams stay authoritative, so a
  // food without these behaves exactly as it always did.
  unitName?: string;
  gramsPerUnit?: number;
}

export interface Entry {
  id: string;
  name: string;
  calories: number;
  qtyLabel: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  addedAt: number;
  items?: FoodItemBasis[];
  recipeIngredients?: string[];
  sourceRecipeId?: string;
  // What this entry was measured as, kept so it stays proportionally
  // re-scalable after the fact — grouping a meal reads it to show the
  // real weight instead of falling back to "treat the logged amount as
  // 100 g". Optional because app.js never wrote it and older entries
  // predate it; absent means "basis unknown", not "zero".
  basis?: FoodItemBasis;
}

export interface DayData {
  entries: Entry[];
}

export interface Profile {
  sex: "male" | "female" | null;
  age: number | null;
  heightCm: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  goalType: "gain" | "lose" | "maintain" | null;
  rateKgPerWeek: number | null;
  /** The weight being aimed at, in kg. Null means only a rate was set. */
  targetWeightKg: number | null;
  /**
   * When the current goal was set, and what the trend read at the time.
   *
   * Without a fixed origin there is nothing to be behind or ahead *of* —
   * progress can only be measured from the earliest weigh-in on record,
   * which keeps measuring from a goal you already abandoned. Both are
   * re-stamped whenever the goal itself changes (type, rate or target),
   * and null on profiles written before they existed, where the code
   * falls back to the first trend point.
   */
  goalStartedAt: number | null;
  goalStartWeightKg: number | null;
  updatedAt: number | null;
}

export interface CalorieTarget {
  mode: "calculated" | "manual";
  min: number;
  max: number;
  calculatedMin: number | null;
  calculatedMax: number | null;
  calculatedAt: number | null;
}

export interface MacroTargets {
  proteinMin: number | null;
  proteinMax: number | null;
  fatMin: number | null;
  fatMax: number | null;
  carbsMin: number | null;
  carbsMax: number | null;
  calculatedAt: number | null;
}

export interface AdaptiveSuggestion {
  deltaKcal: number;
  /** Observed weekly rate from the smoothed weight trend, kg/week. */
  actualRate: number;
  createdAt: number;
}

export interface Adaptive {
  lastCheckedAt: number | null;
  suggestion: (AdaptiveSuggestion & { dismissed?: boolean }) | null;
}

export interface WorkoutGoal {
  weeklySessions: number;
  restSeconds: number;
}

export interface WeightEntry {
  date: string;
  weightKg: number;
  addedAt: number;
}

export type SetType = "normal" | "warmup" | "failure" | "dropset";

export interface ExerciseSet {
  id: string;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  type: SetType;
  addedAt: number;
}

export interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  addedAt: number;
  progressionGroup?: string | null;
  /**
   * Rest after a set of *this* exercise. Seeded from the routine when the
   * session starts and adjustable per exercise afterwards, because the
   * gap you want after a heavy set is not the one you want after a plank.
   * Absent falls back to the day's seed, then to the global default.
   */
  restSeconds?: number;
  /**
   * Fraction of bodyweight this movement actually moves, 0–1. Absent
   * means "derive it from the name" — this only exists to correct the
   * name heuristic, so an untouched exercise keeps tracking it.
   */
  bodyweightShare?: number | null;
}

// One completed run of a timer preset. Shape matches app.js exactly so
// the two apps can read each other's data.
export interface TimerLog {
  id: string;
  name: string;
  category: TimerCategory;
  totalSeconds: number;
  completedAt: number;
}

export interface WorkoutDay {
  exercises: Exercise[];
  timerLogs?: TimerLog[];
  /**
   * The routine this day was started from, if any. Kept so the session
   * can be labelled with what it actually is — "Empuje" rather than the
   * generic "Series" every day used to carry. Absent on days built by
   * hand, which then keep the generic label.
   */
  routineName?: string;
  /**
   * What new exercises on this day default their rest to — set when a
   * routine is started. Not the rest itself: that belongs to each
   * exercise, since a set of pull-ups and a plank do not want the same
   * gap. This is only the seed for exercises added afterwards.
   */
  restSeconds?: number;
}

export interface RecipeItem extends FoodItemBasis {
  id?: string;
}

export interface Recipe {
  id: string;
  name: string;
  items: RecipeItem[];
  createdAt: number;
}

export interface Favorite {
  id: string;
  name: string;
  calories: number;
  qtyLabel: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  addedAt: number;
}

export interface Routine {
  id: string;
  name: string;
  exerciseNames: string[];
  /**
   * Rest per exercise, by name. A routine used to carry one rest for the
   * whole session, chosen when you start it — but the gap after a set of
   * negatives is not the gap after a plank, so every session began with
   * the same round of corrections. Optional: a routine without it behaves
   * exactly as before, seeding every exercise from the session choice.
   */
  restByExercise?: Record<string, number>;
  createdAt: number;
}

export type TimerCategory = "warmup" | "stretch";

// A named step within a timer — "Cuello, 30s". Timers are sequences, not
// single countdowns: a mobility routine is several holds in a row, and
// the run screen walks through them.
export interface TimerInterval {
  name: string;
  seconds: number;
}

export interface TimerPreset {
  id: string;
  name: string;
  category: TimerCategory;
  intervals: TimerInterval[];
  createdAt: number;
}

export interface AnalyticsLayoutEntry {
  id: string;
  hidden: boolean;
}

// A product this device has learned, keyed by barcode. Populated whenever
// a scan finds nothing in Open Food Facts and the user fills it in by
// hand — so the same product is never typed twice. Also acts as a local
// override when OFF's data is wrong.
export interface CachedProduct {
  name: string;
  kcalPer100: number | null;
  proteinPer100: number | null;
  fatPer100: number | null;
  carbsPer100: number | null;
  fiberPer100: number | null;
  sugarPer100: number | null;
  sodiumPer100: number | null;
  savedAt: number;
}

export interface AppState {
  schemaVersion: number;
  days: Record<string, DayData>;
  profile: Profile;
  weightLog: WeightEntry[];
  calorieTarget: CalorieTarget;
  macroTargets: MacroTargets;
  adaptive: Adaptive;
  workouts: Record<string, WorkoutDay>;
  workoutGoal: WorkoutGoal;
  favorites: Favorite[];
  recipes: Recipe[];
  routines: Routine[];
  timers: TimerPreset[];
  onboardingShown: boolean;
  lastExportedAt: number | null;
  analyticsLayout: AnalyticsLayoutEntry[] | null;
  barcodeCache: Record<string, CachedProduct>;
}
