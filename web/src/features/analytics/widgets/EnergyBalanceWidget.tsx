// "Balance energético" — MacroFactor's Energy Balance widget.
//
// Thirty days of intake as bars against a dotted reference line, and
// below it the arithmetic that the chart is really making: average
// intake, minus the reference, equals the difference. The toggle swaps
// the reference between your targets and your estimated expenditure,
// which are different questions — "am I eating what I planned" versus
// "am I in a deficit" — and can easily disagree.
import { useState } from "react";
import { useAppStore } from "../../../shared/store";
import { getRecentDays } from "../../../shared/lib/analytics";
import { estimateCurrentTdee } from "../../../shared/lib/targets";
import { targetMidpoints } from "../week";

// Seven, not thirty. The deck is the "where am I right now" surface —
// its other pages read today and this week — and a balance widget sitting
// on a month of history answered a different question from the ones
// either side of it. The month-long view of the same thing lives in
// Análisis, which is the trend layer.
const DAYS = 7;
const H = 90;

type Ref = "target" | "expenditure";

export function EnergyBalanceWidget() {
  const days = useAppStore((s) => s.days);
  const profile = useAppStore((s) => s.profile);
  const weightLog = useAppStore((s) => s.weightLog);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const [ref, setRef] = useState<Ref>("target");

  const period = getRecentDays(days, DAYS);
  const targetKcal = targetMidpoints(calorieTarget, macroTargets).kcal;
  const expenditure = estimateCurrentTdee(profile, weightLog);

  const refValue = ref === "target" ? targetKcal : expenditure;

  // Averaged over logged days only. Including untouched days would drag
  // the average toward zero and report a deficit you never ate.
  const logged = period.filter((d) => d.total > 0);
  const avgIntake = logged.length ? logged.reduce((s, d) => s + d.total, 0) / logged.length : 0;
  const difference = refValue != null ? avgIntake - refValue : null;

  const scaleMax = Math.max(...period.map((d) => d.total), refValue ?? 0, 1) * 1.1;
  const barW = 100 / DAYS;
  const refY = refValue != null ? H - (refValue / scaleMax) * H : null;

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Balance energético</span>
        <div className="segmented segmented--compact">
          <button
            type="button"
            className={"segmented-btn" + (ref === "target" ? " active" : "")}
            onClick={() => setRef("target")}
          >
            Objetivo
          </button>
          <button
            type="button"
            className={"segmented-btn" + (ref === "expenditure" ? " active" : "")}
            onClick={() => setRef("expenditure")}
            disabled={expenditure == null}
          >
            Gasto
          </button>
        </div>
      </div>

      <svg className="eb-chart" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img"
           aria-label={`Ingesta de los últimos ${DAYS} días`}>
        {period.map((d, i) => {
          const h = (d.total / scaleMax) * H;
          return (
            <rect
              key={d.date}
              x={i * barW + barW * 0.15}
              y={H - h}
              width={barW * 0.7}
              height={Math.max(d.total > 0 ? 1 : 0, h)}
              className="eb-bar"
            />
          );
        })}
        {refY != null && (
          <line x1="0" y1={refY} x2="100" y2={refY} className={"eb-ref is-" + ref} />
        )}
      </svg>
      <p className="eb-caption">Últimos {DAYS} días</p>

      {/* The equation is the widget's actual claim; the chart is its
          evidence. Stated in full so the difference can't be misread as
          a total rather than a daily average. */}
      <div className="eb-equation">
        <div className="eb-term">
          <span className="eb-term-value">{Math.round(avgIntake)}</span>
          <span className="eb-term-label">Ingesta</span>
        </div>
        <span className="eb-op">−</span>
        <div className="eb-term">
          <span className="eb-term-value">{refValue == null ? "—" : Math.round(refValue)}</span>
          <span className="eb-term-label">{ref === "target" ? "Objetivo" : "Gasto est."}</span>
        </div>
        <span className="eb-op">=</span>
        <div className="eb-term">
          <span className={"eb-term-value" + (difference != null && difference < 0 ? " is-deficit" : "")}>
            {difference == null ? "—" : `${difference > 0 ? "+" : "−"}${Math.abs(Math.round(difference))}`}
          </span>
          <span className="eb-term-label">Diferencia</span>
        </div>
      </div>
    </div>
  );
}
