// Ephemeral UI state — deliberately NOT persisted, mirroring the
// module-level variables the vanilla app kept in memory. Split from the
// data store so persist() never writes view state into localStorage.
import { create } from "zustand";
import type { Entry, Exercise } from "./types";

export type TabId = "dashboard" | "nutrition" | "workout" | "settings";

// In-memory clipboard for copying entries to another day. Not persisted —
// a session-scoped clipboard is the expected mental model, same as OS
// copy/paste (and same as the vanilla app).
export interface NutritionClipboard {
  type: "nutrition";
  entries: Entry[];
}

// The workout tab has its own whole-day copy, same clipboard slot: copying
// a session then copying a meal replaces the first, which is what a single
// system clipboard does and what the vanilla app did.
export interface WorkoutClipboard {
  type: "workout";
  exercises: Exercise[];
}

export type DayClipboard = NutritionClipboard | WorkoutClipboard;

export type ModalId = "paste" | "calendar" | "entry";

// What the central + was asked for. The views own their own sheets, so
// rather than hoisting every modal into the shell the button records an
// intent and the relevant view opens it and clears the flag.
export type QuickAction = "food" | "scan" | "weight" | "exercise" | "profile" | "target";

// The calendar serves two jobs: navigating the current view to a day, and
// picking a paste destination. Tracked explicitly so a tap on a date knows
// which one it's doing.
export type CalendarMode = "navigate" | "paste";

interface UiState {
  activeTab: TabId;
  // Shared by the nutrition and workout tabs so switching tabs keeps the
  // same day in view, matching the vanilla behaviour.
  dayOffset: number;
  // Hour groups are open by default: the day's food is the thing you came
  // to look at, and hiding it behind a tap per hour made the log feel like
  // navigation rather than reading. Only the ones tapped shut stay shut,
  // and only for this session.
  /** Whether the day totals count what you've eaten or what's left. */
  totalsMode: "consumed" | "remaining";
  collapsedHourGroups: Set<string>;
  // Grouped (meal) entries currently expanded to show their ingredients.
  expandedGroups: Set<string>;
  clipboard: DayClipboard | null;

  pendingAction: QuickAction | null;
  activeModal: ModalId | null;
  calendarMode: CalendarMode;

  // "Seleccionar" mode: pick several logged entries to copy or merge.
  selectionMode: boolean;
  selectedEntryIds: Set<string>;

  setActiveTab: (tab: TabId) => void;
  setDayOffset: (offset: number) => void;
  shiftDay: (delta: number) => void;
  setTotalsMode: (mode: "consumed" | "remaining") => void;
  toggleHourGroup: (key: string) => void;
  /** Switches to the tab that owns the action, then records the intent. */
  requestAction: (action: QuickAction) => void;
  clearAction: () => void;
  toggleGroup: (id: string) => void;
  setClipboard: (clipboard: DayClipboard | null) => void;
  openModal: (id: ModalId) => void;
  closeModal: () => void;
  openCalendar: (mode: CalendarMode) => void;
  setSelectionMode: (on: boolean) => void;
  toggleEntrySelection: (id: string) => void;
  selectEntries: (ids: string[]) => void;
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
  totalsMode: "consumed",
  collapsedHourGroups: new Set(),
  expandedGroups: new Set(),
  clipboard: null,
  pendingAction: null,
  activeModal: null,
  calendarMode: "navigate",
  selectionMode: false,
  selectedEntryIds: new Set(),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDayOffset: (offset) => set({ dayOffset: offset }),
  shiftDay: (delta) => set((s) => ({ dayOffset: s.dayOffset + delta })),
  setTotalsMode: (mode) => set({ totalsMode: mode }),
  toggleHourGroup: (key) => set((s) => ({ collapsedHourGroups: toggleInSet(s.collapsedHourGroups, key) })),
  requestAction: (action) =>
    set({
      activeTab:
        action === "exercise"
          ? "workout"
          : action === "weight" || action === "profile" || action === "target"
            ? "settings"
            : "nutrition",
      pendingAction: action
    }),
  clearAction: () => set({ pendingAction: null }),
  toggleGroup: (id) => set((s) => ({ expandedGroups: toggleInSet(s.expandedGroups, id) })),
  setClipboard: (clipboard) => set({ clipboard }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  openCalendar: (mode) => set({ activeModal: "calendar", calendarMode: mode }),
  // Leaving selection mode always clears the selection, so re-entering
  // never starts with stale checkmarks.
  setSelectionMode: (on) => set({ selectionMode: on, selectedEntryIds: new Set() }),
  toggleEntrySelection: (id) => set((s) => ({ selectedEntryIds: toggleInSet(s.selectedEntryIds, id) })),
  // Select-all is what keeps whole-day copy reachable now that the header
  // has no default Copiar button.
  selectEntries: (ids) => set({ selectedEntryIds: new Set(ids) })
}));
