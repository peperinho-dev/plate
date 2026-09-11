// Profile, weight-log and target mutations. Every one of these can move
// the calculated targets, so they all run recalculatedTargets() afterwards
// — the vanilla app called recalculateTargets() from the same places.
import { useAppStore } from "../../shared/store";
import type { AppState, Profile } from "../../shared/store/types";
import { recalculatedTargets } from "../../shared/lib/targets";
import { todayKey } from "../../shared/lib/date";
import { computeEma } from "./adaptive";

function withRecalculatedTargets(patch: Partial<AppState>) {
  useAppStore.setState((s) => {
    const next = { ...s, ...patch };
    return { ...patch, ...(recalculatedTargets(next) ?? {}) };
  });
}

/**
 * Saves the profile, re-stamping the goal's origin if the goal itself
 * changed.
 *
 * Only the three fields that define a goal count: editing your height is
 * not starting a new goal, and re-stamping on every save would reset the
 * timeline every time you touched the sheet. The origin weight is read
 * off the smoothed trend rather than the last scale reading, for the same
 * reason everything else about the goal is — one salty dinner should not
 * decide where your goal started from.
 */
export function saveProfile(profile: Profile) {
  const state = useAppStore.getState();
  const prev = state.profile;
  const goalChanged =
    prev.goalType !== profile.goalType ||
    prev.rateKgPerWeek !== profile.rateKgPerWeek ||
    prev.targetWeightKg !== profile.targetWeightKg;

  let { goalStartedAt, goalStartWeightKg } = profile;
  if (goalChanged) {
    const ema = computeEma([...state.weightLog].sort((a, b) => (a.date < b.date ? -1 : 1)));
    goalStartedAt = Date.now();
    goalStartWeightKg = ema.length ? ema[ema.length - 1].ema : null;
  }

  withRecalculatedTargets({
    profile: { ...profile, goalStartedAt, goalStartWeightKg, updatedAt: Date.now() }
  });
}

// One weight per calendar day: re-weighing replaces that day's entry
// rather than stacking duplicates that would skew the trend.
export function logWeight(weightKg: number, date = todayKey(0)) {
  const existing = useAppStore.getState().weightLog.filter((w) => w.date !== date);
  withRecalculatedTargets({
    weightLog: [...existing, { date, weightKg, addedAt: Date.now() }]
  });
}

export function removeWeightEntry(date: string) {
  withRecalculatedTargets({
    weightLog: useAppStore.getState().weightLog.filter((w) => w.date !== date)
  });
}

export function setManualCalorieTarget(min: number, max: number) {
  useAppStore.setState((s) => ({
    calorieTarget: { ...s.calorieTarget, mode: "manual", min: Math.round(min), max: Math.round(max) }
  }));
}

// Hands control back to the calculated range, re-adopting it immediately.
// Not a React hook despite operating on store state — named "adopt" rather
// than "use" so neither readers nor the rules-of-hooks lint mistake it for one.
export function adoptCalculatedCalorieTarget() {
  useAppStore.setState((s) => ({
    calorieTarget: {
      ...s.calorieTarget,
      mode: "calculated",
      min: s.calorieTarget.calculatedMin ?? s.calorieTarget.min,
      max: s.calorieTarget.calculatedMax ?? s.calorieTarget.max
    }
  }));
}
