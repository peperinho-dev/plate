// App shell: the three-tab frame from the vanilla index.html. Tab
// switching is plain state — no router, since nothing here needs a
// shareable URL and modals are overlays rather than routes.
import type { ReactNode } from "react";
import { useUiStore, type TabId } from "../shared/store/ui";
import { NutritionView } from "../features/nutrition/NutritionView";
import { TargetIcon, DumbbellIcon, BarChartIcon } from "../shared/components/Icons";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "nutrition", label: "Nutrición", icon: <TargetIcon /> },
  { id: "workout", label: "Entreno", icon: <DumbbellIcon /> },
  { id: "analytics", label: "Análisis", icon: <BarChartIcon /> }
];

// Placeholder until the Entreno/Análisis ports land in later phases.
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="view">
      <header className="topbar">
        <span className="day-label">{title}</span>
      </header>
      <main className="content">
        <div className="card">
          <div className="empty-state">
            <p>Aún no migrado a la nueva versión.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <>
      <div className="app">
        {activeTab === "nutrition" && <NutritionView />}
        {activeTab === "workout" && <ComingSoon title="Entreno" />}
        {activeTab === "analytics" && <ComingSoon title="Análisis" />}
      </div>

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
    </>
  );
}
