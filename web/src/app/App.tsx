// App shell: the three-tab frame from the vanilla index.html. Tab
// switching is plain state — no router, since nothing here needs a
// shareable URL and modals are overlays rather than routes.
import { useState, type ReactNode } from "react";
import { useUiStore, type TabId } from "../shared/store/ui";
import { NutritionView } from "../features/nutrition/NutritionView";
import { WorkoutView } from "../features/workouts/WorkoutView";
import { AnalyticsView } from "../features/analytics/AnalyticsView";
import { TargetIcon, DumbbellIcon, BarChartIcon } from "../shared/components/Icons";
import { Toast } from "../shared/components/Toast";
import { QuickActionsSheet } from "./QuickActionsSheet";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "nutrition", label: "Nutrición", icon: <TargetIcon /> },
  { id: "workout", label: "Entreno", icon: <DumbbellIcon /> },
  { id: "analytics", label: "Análisis", icon: <BarChartIcon /> }
];

export default function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const [quickOpen, setQuickOpen] = useState(false);
  // While picking entries the selection has its own action bar; two
  // competing add affordances on top of each other reads as a bug.
  const selectionMode = useUiStore((s) => s.selectionMode);

  return (
    <>
      <div className="app">
        {activeTab === "nutrition" && <NutritionView />}
        {activeTab === "workout" && <WorkoutView />}
        {activeTab === "analytics" && <AnalyticsView />}
      </div>

      {/* Sits above the bar rather than inside it: with three evenly
          spaced tabs there is no middle slot to put it in, and dropping it
          into the row would push the button off centre. */}
      {!selectionMode && (
        <button
          type="button"
          className="tabbar-add"
          aria-label="Añadir"
          onClick={() => setQuickOpen(true)}
        >
          +
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={"tab-btn" + (activeTab === tab.id ? " active" : "")}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span> {tab.label}
          </button>
        ))}
      </nav>

      <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <Toast />
    </>
  );
}
