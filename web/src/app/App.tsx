// App shell: the three-tab frame from the vanilla index.html. Tab
// switching is plain state — no router, since nothing here needs a
// shareable URL and modals are overlays rather than routes.
import { useState, type ReactNode } from "react";
import { useUiStore, type TabId } from "../shared/store/ui";
import { NutritionView } from "../features/nutrition/NutritionView";
import { WorkoutView } from "../features/workouts/WorkoutView";
import { AnalyticsView } from "../features/analytics/AnalyticsView";
import { SettingsView } from "../features/profile/SettingsView";
import { TargetIcon, DumbbellIcon, BarChartIcon, GearIcon, PlusIcon } from "../shared/components/Icons";
import { Toast } from "../shared/components/Toast";
import { QuickActionsSheet } from "./QuickActionsSheet";

// Split either side of the central +. The two groups get equal width, so
// the button lands dead centre even though the tabs don't divide evenly.
const LEFT_TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "Resumen", icon: <BarChartIcon /> },
  { id: "nutrition", label: "Comida", icon: <TargetIcon /> }
];
const RIGHT_TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "workout", label: "Entreno", icon: <DumbbellIcon /> },
  { id: "settings", label: "Ajustes", icon: <GearIcon size={22} /> }
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
        {activeTab === "dashboard" && <AnalyticsView />}
        {activeTab === "nutrition" && <NutritionView />}
        {activeTab === "workout" && <WorkoutView />}
        {activeTab === "settings" && <SettingsView />}
      </div>

      <nav className="tabbar">
        <div className="tabbar-group">
          {LEFT_TABS.map((tab) => (
            <button
              key={tab.id}
              className={"tab-btn" + (activeTab === tab.id ? " active" : "")}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="tabbar-add"
          aria-label="Añadir"
          disabled={selectionMode}
          onClick={() => setQuickOpen(true)}
        >
          {/* An SVG, not a "+" character. The glyph sits entirely above
              the baseline (ascent 11.4, descent -1.1), so centring its
              line box leaves the visible mark high in the circle. The
              icon is symmetric about its own viewBox. */}
          <PlusIcon size={13} />
        </button>

        <div className="tabbar-group">
          {RIGHT_TABS.map((tab) => (
            <button
              key={tab.id}
              className={"tab-btn" + (activeTab === tab.id ? " active" : "")}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <Toast />
    </>
  );
}
