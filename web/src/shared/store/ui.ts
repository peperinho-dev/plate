// Ephemeral UI state — deliberately NOT persisted, mirroring the
// module-level variables the vanilla app kept in memory. Split from the
// data store so persist() never writes view state into localStorage.
import { create } from "zustand";
import type { Entry } from "./types";

export type TabId = "nutrition" | "workout" | "analytics";

// In-memory clipboard for copying entries to another day. Not persisted —
// a session-scoped clipboard is the expected mental model, same as OS
// copy/paste (and same as the vanilla app).
export interface NutritionClipboard {
  type: "nutrition";
  entries: Entry[];
}

export type ModalId = "paste" | "calendar" | "entry";

// The calendar serves two jobs: navigating the current view to a day, and
// picking a paste destination. Tracked explicitly so a tap on a date knows
// which one it's doing.
export type CalendarMode = "navigate" | "paste";

interface UiState {
  activeTab: TabId;
  // Shared by the nutrition and workout tabs so switching tabs keeps the
  // same day in view, matching the vanilla behaviour.
  dayOffset: number;
  // Hour groups default to collapsed on every fresh load so the day view
  // opens tidy; only the ones tapped stay open for this session.
  expandedHourGroups: Set<string>;
  // Grouped (meal) entries currently expanded to show their ingredients.
  expandedGroups: Set<string>;
  clipboard: NutritionClipboard | null;

  activeModal: ModalId | null;
  calendarMode: CalendarMode;

  // "Seleccionar" mode: pick several logged entries to copy or merge.
  selectionMode: boolean;
  selectedEntryIds: Set<string>;

  setActiveTab: (tab: TabId) => void;
  setDayOffset: (offset: number) => void;
  shiftDay: (delta: number) => void;
  toggleHourGroup: (key: string) => void;
  toggleGroup: (id: string) => void;
  setClipboard: (clipboard: NutritionClipboard | null) => void;
  openModal: (id: ModalId) => void;
  closeModal: () => void;
  openCalendar: (mode: CalendarMode) => void;
  setSelectionMode: (on: boolean) => void;
  toggleEntrySelection: (id: string) => void;
}

// Sets are always replaced rather than mutated — an in-place `.add()`
// keeps the same reference and would not re-render subscribers.
function toggleInSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export const useUiStore = create<UiState>()((set) => ({
  activeTab: "nutrition",
  dayOffset: 0,
  expandedHourGroups: new Set(),
  expandedGroups: new Set(),
  clipboard: null,
  activeModal: null,
  calendarMode: "navigate",
  selectionMode: false,
  selectedEntryIds: new Set(),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDayOffset: (offset) => set({ dayOffset: offset }),
  shiftDay: (delta) => set((s) => ({ dayOffset: s.dayOffset + delta })),
  toggleHourGroup: (key) => set((s) => ({ expandedHourGroups: toggleInSet(s.expandedHourGroups, key) })),
  toggleGroup: (id) => set((s) => ({ expandedGroups: toggleInSet(s.expandedGroups, id) })),
  setClipboard: (clipboard) => set({ clipboard }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  openCalendar: (mode) => set({ activeModal: "calendar", calendarMode: mode }),
  // Leaving selection mode always clears the selection, so re-entering
  // never starts with stale checkmarks.
  setSelectionMode: (on) => set({ selectionMode: on, selectedEntryIds: new Set() }),
  toggleEntrySelection: (id) => set((s) => ({ selectedEntryIds: toggleInSet(s.selectedEntryIds, id) }))
}));
