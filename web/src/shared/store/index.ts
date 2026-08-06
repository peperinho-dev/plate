import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState } from "./types";
import { STORAGE_KEY, SCHEMA_VERSION, loadInitialState } from "./schema";
import { recalculatedTargets } from "../lib/targets";

// migrateData() (via loadInitialState) is the ONE place schema migration
// happens — persist's own version/migrate is a deliberate no-op passthrough
// so there's never a second, competing migration authority. See schema.ts.
export const useAppStore = create<AppState>()(
  persist(
    () => loadInitialState(),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      migrate: (persistedState) => persistedState as AppState
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
