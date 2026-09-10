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
import { StatCell } from "./StatCell";

export function DailyNutritionWidget() {
  const days = useAppStore((s) => s.days);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const entries = days[todayKey(0)]?.entries ?? [];
  const consumed = entries.reduce((sum, e) => sum + e.calories, 0);
  const macros = sumMacros(entries);
  const t = targetMidpoints(calorieTarget, macroTargets);
  const remaining = t.kcal == null ? null : Math.max(0, t.kcal - consumed);

  // Same cells, same order as the weekly widget's grid, so swiping
  // between the two doesn't rearrange the same four numbers.
  const cells = [
    { kind: "fat" as const, value: macros.fat, target: t.fat, suffix: "G" },
    { kind: "protein" as const, value: macros.protein, target: t.protein, suffix: "P" },
    { kind: "carbs" as const, value: macros.carbs, target: t.carbs, suffix: "C" }
  ];

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Hoy</span>
      </div>

      <div className="dn-hero">
        <span className="dn-hero-value">{remaining == null ? Math.round(consumed) : remaining}</span>
        <span className="dn-hero-label">{remaining == null ? "kcal consumidas" : "kcal restantes"}</span>
      </div>

      {/* The same cell as everywhere else, rather than a second reading of
          consumed and target in a different shape beside the hero. */}
      <StatCell kind="kcal" value={consumed} target={t.kcal} />

      <div className="dn-macros">
        {cells.map((c) => (
          <StatCell key={c.kind} kind={c.kind} value={c.value} target={c.target} suffix={c.suffix} />
        ))}
      </div>

    </div>
  );
}
