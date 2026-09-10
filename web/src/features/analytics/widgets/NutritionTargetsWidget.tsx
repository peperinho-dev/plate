// "Nutrición y objetivos" — MacroFactor's Nutrition & Targets widget.
//
// The current week as seven columns of four bars (calories, protein, fat,
// carbs), with the day in progress boxed. Tapping a day brings it into
// focus; tapping the focused day again drops the focus and the numbers
// become the week's totals, which is the one place in the app that
// answers "how has this week gone" rather than "how has today gone".
//
// Consumido/Restante flips what the numbers count. The bars don't change
// — a bar is always progress toward the target — only the figure beside
// them does.
import { useState } from "react";
import { useAppStore } from "../../../shared/store";
import { currentWeek, targetMidpoints, type WeekDay } from "../week";
import { StatCell, type MacroKind } from "./StatCell";

type Mode = "consumed" | "remaining";

// Ordered as the reference app's header grid reads: calories and fat on
// the top row, protein and carbs beneath.
const MACROS = [
  { key: "kcal", suffix: undefined },
  { key: "fat", suffix: "G" },
  { key: "protein", suffix: "P" },
  { key: "carbs", suffix: "C" }
] as const;

type MacroKey = MacroKind;

// The per-day bars keep the article's stacking order - calories, protein,
// fat, carbs, top to bottom - which is not the grid's reading order.
const BAR_ORDER: MacroKey[] = ["kcal", "protein", "fat", "carbs"];

const valueOf = (d: WeekDay, k: MacroKey) => (k === "kcal" ? d.total : d[k]);

export function NutritionTargetsWidget() {
  const days = useAppStore((s) => s.days);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const week = currentWeek(days);
  const targets = targetMidpoints(calorieTarget, macroTargets);
  const todayIndex = week.findIndex((d) => d.isToday);

  // null means "no day focused", which is the whole-week view.
  const [focus, setFocus] = useState<number | null>(todayIndex >= 0 ? todayIndex : null);
  const [mode, setMode] = useState<Mode>("consumed");

  const focused = focus !== null ? week[focus] : null;
  // Future days have no targets to count toward, so a week total that
  // included them would make every Monday look like a catastrophic
  // shortfall.
  const elapsed = week.filter((d) => !d.isFuture);

  const readout = (k: MacroKey) => {
    const target = targets[k];
    const consumed = focused
      ? valueOf(focused, k)
      : elapsed.reduce((sum, d) => sum + valueOf(d, k), 0);
    const scaledTarget = target == null ? null : focused ? target : target * elapsed.length;
    const shown =
      mode === "remaining" && scaledTarget != null ? Math.max(0, scaledTarget - consumed) : consumed;
    return { shown, target: scaledTarget };
  };

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Nutrición y objetivos</span>
        <div className="segmented segmented--compact">
          <button
            type="button"
            className={"segmented-btn" + (mode === "consumed" ? " active" : "")}
            onClick={() => setMode("consumed")}
          >
            Consumido
          </button>
          <button
            type="button"
            className={"segmented-btn" + (mode === "remaining" ? " active" : "")}
            onClick={() => setMode("remaining")}
          >
            Restante
          </button>
        </div>
      </div>

      <div className="ntw-week">
        {week.map((d, i) => (
          <button
            type="button"
            key={d.date}
            className={
              "ntw-day" +
              (focus === i ? " is-focused" : "") +
              (d.isFuture ? " is-future" : "") +
              (d.isToday ? " is-today" : "")
            }
            // Tapping the focused day clears the focus, which is how the
            // week view is reached.
            onClick={() => setFocus(focus === i ? null : i)}
            aria-pressed={focus === i}
          >
            <span className="ntw-bars">
              {BAR_ORDER.map((key) => {
                const target = targets[key];
                const v = valueOf(d, key);
                const pct = target ? Math.min(100, (v / target) * 100) : 0;
                const met = target != null && v >= target;
                return (
                  <span className={"ntw-bar is-" + key + (met ? " is-met" : "")} key={key}>
                    <span className="ntw-bar-fill" style={{ width: `${pct}%` }} />
                  </span>
                );
              })}
            </span>
            <span className="ntw-letter">{d.letter}</span>
          </button>
        ))}
      </div>

      <p className="widget-note">
        {focused
          ? focused.isToday
            ? "Hoy"
            : focused.label
          : `Semana · ${elapsed.length} ${elapsed.length === 1 ? "día" : "días"}`}
      </p>

      <div className="ntw-grid">
        {MACROS.map(({ key, suffix }) => {
          const { shown, target } = readout(key);
          return <StatCell key={key} kind={key} value={shown} target={target} suffix={suffix} />;
        })}
      </div>

    </div>
  );
}
