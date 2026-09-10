// "Hoy" — MacroFactor's Daily Nutrition / Food Log Focus widget.
//
// Strictly less information than the weekly widget, and that's the point:
// the same day's numbers with room to breathe, large enough to read at
// arm's length. Remaining leads, because that's the number you act on
// when deciding what to eat next.
import { useAppStore } from "../../../shared/store";
import { todayKey } from "../../../shared/lib/date";
import { sumMacros } from "../../../shared/lib/nutrition";
import { targetMidpoints } from "../week";

export function DailyNutritionWidget() {
  const days = useAppStore((s) => s.days);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const entries = days[todayKey(0)]?.entries ?? [];
  const consumed = entries.reduce((sum, e) => sum + e.calories, 0);
  const macros = sumMacros(entries);
  const t = targetMidpoints(calorieTarget, macroTargets);
  const remaining = t.kcal == null ? null : Math.max(0, t.kcal - consumed);

  const rows = [
    { label: "Proteína", value: macros.protein, target: t.protein, cls: "is-protein" },
    { label: "Grasa", value: macros.fat, target: t.fat, cls: "is-fat" },
    { label: "Carbos", value: macros.carbs, target: t.carbs, cls: "is-carbs" }
  ];

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Hoy</span>
      </div>

      <div className="dn-hero">
        <div className="dn-hero-main">
          <span className="dn-hero-value">{remaining == null ? Math.round(consumed) : remaining}</span>
          <span className="dn-hero-label">{remaining == null ? "kcal consumidas" : "kcal restantes"}</span>
        </div>
        <div className="dn-hero-side">
          <div className="dn-side-item">
            <span className="dn-side-value">{Math.round(consumed)}</span>
            <span className="dn-side-label">Consumido</span>
          </div>
          <div className="dn-side-item">
            <span className="dn-side-value">{t.kcal == null ? "—" : Math.round(t.kcal)}</span>
            <span className="dn-side-label">Objetivo</span>
          </div>
        </div>
      </div>

      <div className="dn-macros">
        {rows.map((r) => {
          const pct = r.target ? Math.min(100, (r.value / r.target) * 100) : 0;
          return (
            <div className={"dn-macro " + r.cls} key={r.label}>
              <span className="dn-macro-label">{r.label}</span>
              <span className="dn-macro-value">
                {Math.round(r.value)}
                <span className="dn-macro-target">{r.target == null ? "" : ` / ${Math.round(r.target)} g`}</span>
              </span>
              <span className="dn-macro-track">
                <span className="dn-macro-fill" style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
