// Profile, weight-log and target mutations. Every one of these can move
// the calculated targets, so they all run recalculatedTargets() afterwards
// — the vanilla app called recalculateTargets() from the same places.
import { useAppStore } from "../../shared/store";
import type { AppState, Profile } from "../../shared/store/types";
import { recalculatedTargets } from "../../shared/lib/targets";
import { todayKey } from "../../shared/lib/date";

function withRecalculatedTargets(patch: Partial<AppState>) {
  useAppStore.setState((s) => {
    const next = { ...s, ...patch };
    return { ...patch, ...(recalculatedTargets(next) ?? {}) };
  });
}

export function saveProfile(profile: Profile) {
  withRecalculatedTargets({ profile: { ...profile, updatedAt: Date.now() } });
}

// One weight per calendar day: re-weighing replaces that day's entry
// rather than stacking duplicates that would skew the trend.
export function logWeight(weightKg: number, date = todayKey(0)) {
  const existing = useAppStore.getState().weightLog.filter((w) => w.date !== date);
  withRecalculatedTargets({
    weightLog: [...existing, { date, weightKg, addedAt: Date.now() }]
  });
}

export function setManualCalorieTarget(min: number, max: number) {
  useAppStore.setState((s) => ({
    calorieTarget: { ...s.calorieTarget, mode: "manual", min: Math.round(min), max: Math.round(max) }
  }));
}

// Hands control back to the calculated range, re-adopting it immediately.
export function useCalculatedCalorieTarget() {
  useAppStore.setState((s) => ({
    calorieTarget: {
      ...s.calorieTarget,
      mode: "calculated",
      min: s.calorieTarget.calculatedMin ?? s.calorieTarget.min,
      max: s.calorieTarget.calculatedMax ?? s.calorieTarget.max
    }
  }));
}
