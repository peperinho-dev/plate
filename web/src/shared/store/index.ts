import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState } from "./types";
import { STORAGE_KEY, SCHEMA_VERSION, loadInitialState } from "./schema";

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
