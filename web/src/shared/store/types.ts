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
}

export interface TimerLog {
  category: "warmup" | "stretch";
  seconds: number;
  addedAt: number;
}

export interface WorkoutDay {
  exercises: Exercise[];
  timerLogs?: TimerLog[];
}

export interface RecipeItem extends FoodItemBasis {
  id?: string;
}

export interface Recipe {
  id: string;
  name: string;
  items: RecipeItem[];
  addedAt: number;
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
}

export interface TimerPreset {
  id: string;
  name: string;
  category: "warmup" | "stretch";
  seconds: number;
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
