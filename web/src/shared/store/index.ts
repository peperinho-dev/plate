import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState } from "./types";
import { STORAGE_KEY, SCHEMA_VERSION, loadInitialState, migrateData } from "./schema";
import { recalculatedTargets } from "../lib/targets";

// migrateData() is the ONE place schema migration happens. It has to run
// from `merge`, not from the initializer: persist rehydrates *over*
// whatever the initializer returned, so migrating there alone meant the
// stored (unmigrated) blob simply replaced the migrated result and every
// migration silently did nothing. `merge` runs on every rehydrate, which
// is exactly the guarantee this needs — unlike `migrate`, which zustand
// only calls when the stored version differs from the current one.
export const useAppStore = create<AppState>()(
  persist(
    () => loadInitialState(),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      merge: (persistedState) => migrateData(persistedState)
    }
  )
);

// Refresh the calculated calorie/macro targets once at startup, mirroring
// the recalculateTargets() call app.js makes on load: targets are derived
// from the most recent weigh-in, so without this they stay frozen at
// whatever they were when the profile was last edited. Runs after create()
// because persist hydrates synchronously during it — recalculating any
// earlier would just be overwritten by the stored values.
const startupTargets = recalculatedTargets(useAppStore.getState());
if (startupTargets) useAppStore.setState(startupTargets);
