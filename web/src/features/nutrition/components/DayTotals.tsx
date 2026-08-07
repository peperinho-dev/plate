// Daily total + range band + macro/micro breakdown. Ported from the
// totals section of render() in app.js. Note the tone rule carried over
// from the original: over-range is stated neutrally, never as a failure.
import type { Entry } from "../../../shared/store/types";
import { useAppStore } from "../../../shared/store";
import { AnimatedNumber } from "../../../shared/components/AnimatedNumber";
import { sumCalories, sumMacros, sumMicros } from "../../../shared/lib/nutrition";

interface DayTotalsProps {
  entries: Entry[];
  /** The visible day — changing it snaps the total instead of counting. */
  dayKey: string;
}

function MacroCol({ label, total, min, max }: { label: string; total: number; min: number; max: number }) {
  const pct = Math.min(100, (total / max) * 100 || 0);
  const inRange = total >= min && total <= max;
  return (
    <div className="macro-col">
      <div className="macro-label">{label}</div>
      <div className="macro-value">
        {Math.round(total)}/{max} g
      </div>
      <div className="macro-track">
        <div className={"macro-fill" + (inRange ? " in-range" : "")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DayTotals({ entries, dayKey }: DayTotalsProps) {
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const total = sumCalories(entries);
  const { min, max } = calorieTarget;
  const inRange = total >= min && total <= max;

  const statusText = inRange
    ? "dentro del rango"
    : total < min
      ? `${Math.round(min - total)} kcal por debajo del rango`
      : `${Math.round(total - max)} kcal por encima del rango`;

  // Scale the bar so both the band and the marker stay on-screen even when
  // the total overshoots the target range.
  const domainMax = Math.max(max, total) * 1.15 || 1;

  const macros = sumMacros(entries);
  const micros = sumMicros(entries);
  const showMacros = macroTargets.proteinMin !== null;

  return (
    <div className="totals">
      <div className="totals-row">
        <span className="totals-label">Total</span>
        <span className="totals-value">
          <AnimatedNumber value={total} resetKey={dayKey} /> kcal
        </span>
      </div>
      <div className={"range-status" + (inRange ? " in-range" : "")}>{statusText}</div>
      <div className="range" aria-hidden="true">
        <div className="range-track">
          <div
            className="range-band"
            style={{ left: `${(min / domainMax) * 100}%`, width: `${((max - min) / domainMax) * 100}%` }}
          />
          <div className="range-marker" style={{ left: `${Math.min(100, (total / domainMax) * 100)}%` }} />
        </div>
        <div className="range-labels">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>

      {showMacros && (
        <div className="macro-row">
          <MacroCol label="Prot." total={macros.protein} min={macroTargets.proteinMin!} max={macroTargets.proteinMax!} />
          <MacroCol label="Grasa" total={macros.fat} min={macroTargets.fatMin!} max={macroTargets.fatMax!} />
          <MacroCol label="Carbos" total={macros.carbs} min={macroTargets.carbsMin!} max={macroTargets.carbsMax!} />
        </div>
      )}

      {/* Secondary to calories and macros, so it reads as a footnote
          rather than a third block of the same weight. */}
      {micros.hasAny && (
        <div className="micro-row--compact">
          <span>Fibra {Math.round(micros.fiber)} g</span>
          <span className="micro-sep">·</span>
          <span>Azúcar {Math.round(micros.sugar)} g</span>
          <span className="micro-sep">·</span>
          <span>Sodio {Math.round(micros.sodium)} mg</span>
        </div>
      )}
    </div>
  );
}
