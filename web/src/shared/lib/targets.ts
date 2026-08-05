// Calorie and macro target calculation, ported from app.js.
//
// Mifflin-St Jeor for BMR, an activity multiplier for TDEE, then a daily
// surplus/deficit derived from the user's own chosen rate. The result is a
// *range*, never a single number — the app's whole tone is a band you land
// inside rather than a line you fail to hit.
import type { AppState, MacroTargets, Profile, WeightEntry } from "../store/types";

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};
const KCAL_PER_KG = 7700; // approximate energy density of 1kg body-mass change
const BAND_HALF_WIDTH_KCAL = 100; // ±100 kcal around the computed center
const PROTEIN_G_PER_KG = 1.8; // reasonable target for a lifter in a surplus
const PROTEIN_BAND_G = 15;
const FAT_PCT_OF_CALORIES = 0.25; // fat as a share of the calorie-target center
const FAT_BAND_G = 10;
const CARBS_BAND_G = 25; // carbs fill whatever calories remain after protein+fat

export interface Range {
  min: number;
  max: number;
}

export function latestWeightEntry(weightLog: WeightEntry[]): WeightEntry | null {
  if (!weightLog || weightLog.length === 0) return null;
  return [...weightLog].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.addedAt || 0) - (a.addedAt || 0);
  })[0];
}

export function calculateCalorieRange(profile: Profile, latestWeightKg: number | null): Range | null {
  if (!profile || !latestWeightKg) return null;
  const { sex, age, heightCm, activityLevel, goalType, rateKgPerWeek } = profile;
  if (!sex || !age || !heightCm || !activityLevel || !goalType) return null;
  if (goalType !== "maintain" && (rateKgPerWeek === null || rateKgPerWeek === undefined)) return null;

  const bmr =
    sex === "female"
      ? 10 * latestWeightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * latestWeightKg + 6.25 * heightCm - 5 * age + 5;

  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || ACTIVITY_MULTIPLIERS.sedentary);
  const dailyDelta = ((goalType === "maintain" ? 0 : rateKgPerWeek!) * KCAL_PER_KG) / 7;
  const signedDelta = goalType === "lose" ? -dailyDelta : dailyDelta;
  const center = tdee + signedDelta;

  return {
    min: Math.max(0, Math.round((center - BAND_HALF_WIDTH_KCAL) / 10) * 10),
    max: Math.round((center + BAND_HALF_WIDTH_KCAL) / 10) * 10
  };
}

export function calculateMacroTargets(
  latestWeightKg: number | null,
  calorieCenter: number | null
): { protein: Range; fat: Range; carbs: Range } | null {
  if (!latestWeightKg || !calorieCenter) return null;

  const proteinCenter = latestWeightKg * PROTEIN_G_PER_KG;
  const fatCenter = (calorieCenter * FAT_PCT_OF_CALORIES) / 9;
  const carbsCenter = Math.max(0, (calorieCenter - proteinCenter * 4 - fatCenter * 9) / 4);

  const band = (center: number, half: number): Range => ({
    min: Math.max(0, Math.round(center - half)),
    max: Math.round(center + half)
  });

  return {
    protein: band(proteinCenter, PROTEIN_BAND_G),
    fat: band(fatCenter, FAT_BAND_G),
    carbs: band(carbsCenter, CARBS_BAND_G)
  };
}

// Returns the patch to apply, or null when there isn't enough profile or
// weight data yet — in which case existing targets are left untouched
// rather than reset to something arbitrary.
export function recalculatedTargets(state: AppState): Partial<AppState> | null {
  const latest = latestWeightEntry(state.weightLog);
  const latestWeightKg = latest ? latest.weightKg : null;
  const computed = calculateCalorieRange(state.profile, latestWeightKg);
  if (!computed) return null;

  const calorieTarget = {
    ...state.calorieTarget,
    calculatedMin: computed.min,
    calculatedMax: computed.max,
    calculatedAt: Date.now(),
    // A manual override stays in force; only "calculated" mode adopts it.
    ...(state.calorieTarget.mode === "calculated" ? { min: computed.min, max: computed.max } : {})
  };

  const macros = calculateMacroTargets(latestWeightKg, (computed.min + computed.max) / 2);
  const macroTargets: MacroTargets = macros
    ? {
        proteinMin: macros.protein.min,
        proteinMax: macros.protein.max,
        fatMin: macros.fat.min,
        fatMax: macros.fat.max,
        carbsMin: macros.carbs.min,
        carbsMax: macros.carbs.max,
        calculatedAt: Date.now()
      }
    : state.macroTargets;

  return { calorieTarget, macroTargets };
}
