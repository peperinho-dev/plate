// Daily total + range band + macro/micro breakdown. Ported from the
// totals section of render() in app.js. Note the tone rule carried over
// from the original: over-range is stated neutrally, never as a failure.
import type { Entry } from "../../../shared/store/types";
import { useAppStore } from "../../../shared/store";
import { AnimatedNumber } from "../../../shared/components/AnimatedNumber";
import { sumCalories, sumMacros, sumMicros } from "../../../shared/lib/nutrition";
import { useUiStore } from "../../../shared/store/ui";
import { targetMidpoints } from "../../analytics/week";

interface DayTotalsProps {
  entries: Entry[];
  /** The visible day — changing it snaps the total instead of counting. */
  dayKey: string;
}

function MacroCol({
  label,
  total,
  min,
  max,
  target,
  remaining
}: {
  label: string;
  total: number;
  min: number;
  max: number;
  /** The single number to aim at: the midpoint of min..max. */
  target: number;
  remaining: boolean;
}) {
  // The bar always shows progress toward the target. Only the figure
  // changes with the mode — a bar that emptied as you ate would invert
  // the meaning of every other bar in the app.
  //
  // Measured against the midpoint, not the ceiling. This screen used to
  // divide by max while Resumen divided by the midpoint, so the same
  // protein figure was reported against two different targets depending
  // on which tab you were looking at. min..max still decides the colour —
  // that is a different question ("am I inside the band?") and the band
  // is drawn right above for calories.
  const pct = Math.min(100, (total / target) * 100 || 0);
  const inRange = total >= min && total <= max;
  const shown = remaining ? Math.max(0, target - total) : total;
  return (
    <div className="macro-col">
      <div className="macro-label">{label}</div>
      <div className="macro-value">
        {Math.round(shown)}/{Math.round(target)} g
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
  const totalsMode = useUiStore((s) => s.totalsMode);
  const setTotalsMode = useUiStore((s) => s.setTotalsMode);
  const remaining = totalsMode === "remaining";

  const total = sumCalories(entries);
  const { min, max } = calorieTarget;
  const inRange = total >= min && total <= max;

  // In Restante mode the headline counts down to the top of the range, so
  // an under-range status phrased as "por debajo" put two different
  // remaining figures side by side with nothing saying they measure to
  // opposite ends of the band. Naming the destination fixes that.
  const statusText = inRange
    ? "dentro del rango"
    : total < min
      ? remaining
        ? `${Math.round(min - total)} kcal para entrar en el rango`
        : `${Math.round(min - total)} kcal por debajo del rango`
      : `${Math.round(total - max)} kcal por encima del rango`;

  // Scale the bar so both the band and the marker stay on-screen even when
  // the total overshoots the target range.
  const domainMax = Math.max(max, total) * 1.15 || 1;

  const macros = sumMacros(entries);
  const micros = sumMicros(entries);
  const showMacros = macroTargets.proteinMin !== null;
  const mid = targetMidpoints(calorieTarget, macroTargets);

  // Counted against the top of the range: the range's ceiling is the
  // number you'd exceed, so "restante" is how much is still available
  // rather than how far you are from its midpoint.
  const remainingKcal = Math.max(0, max - total);

  return (
    <div className="totals">
      <div className="totals-modes">
        <div className="segmented segmented--compact">
          <button
            type="button"
            className={"segmented-btn" + (!remaining ? " active" : "")}
            onClick={() => setTotalsMode("consumed")}
          >
            Consumido
          </button>
          <button
            type="button"
            className={"segmented-btn" + (remaining ? " active" : "")}
            onClick={() => setTotalsMode("remaining")}
          >
            Restante
          </button>
        </div>
      </div>
      <div className="totals-row">
        <span className="totals-label">{remaining ? "Restante" : "Total"}</span>
        <span className="totals-value">
          <AnimatedNumber value={remaining ? remainingKcal : total} resetKey={dayKey + totalsMode} /> kcal
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
          <MacroCol label="Prot." total={macros.protein} min={macroTargets.proteinMin!} max={macroTargets.proteinMax!} target={mid.protein!} remaining={remaining} />
          <MacroCol label="Grasa" total={macros.fat} min={macroTargets.fatMin!} max={macroTargets.fatMax!} target={mid.fat!} remaining={remaining} />
          <MacroCol label="Carbos" total={macros.carbs} min={macroTargets.carbsMin!} max={macroTargets.carbsMax!} target={mid.carbs!} remaining={remaining} />
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
