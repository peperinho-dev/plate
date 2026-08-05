// Daily total + range band + macro/micro breakdown. Ported from the
// totals section of render() in app.js. Note the tone rule carried over
// from the original: over-range is stated neutrally, never as a failure.
import type { Entry } from "../../../shared/store/types";
import { useAppStore } from "../../../shared/store";
import { sumCalories, sumMacros, sumMicros } from "../../../shared/lib/nutrition";

interface DayTotalsProps {
  entries: Entry[];
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

export function DayTotals({ entries }: DayTotalsProps) {
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
        <span className="totals-value">{Math.round(total)} kcal</span>
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

      {micros.hasAny && (
        <div className="micro-row">
          <div className="micro-item">
            <span className="micro-label">Fibra</span>
            <span className="micro-value">{Math.round(micros.fiber)} g</span>
          </div>
          <div className="micro-item">
            <span className="micro-label">Azúcar</span>
            <span className="micro-value">{Math.round(micros.sugar)} g</span>
          </div>
          <div className="micro-item">
            <span className="micro-label">Sodio</span>
            <span className="micro-value">{Math.round(micros.sodium)} mg</span>
          </div>
        </div>
      )}
    </div>
  );
}
