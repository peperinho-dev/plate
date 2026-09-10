// One nutrient over time, opened by tapping its row in the overview.
//
// Daily bars against two references: the target, if one exists, and the
// average across the days that were actually logged. Unlogged days draw
// nothing rather than a zero — a day you didn't record is missing data,
// not a day you ate no protein, and a chart that can't tell those apart
// makes every gap look like a fast.
import { nutrientSeries, trendWindow, type NutrientId } from "../overview";
import { useAppStore } from "../../../shared/store";

const H = 64;

interface NutrientTrendProps {
  nutrient: NutrientId;
  dayKey: string;
  periodDays: number;
  target: number | null;
  unit: string;
  kind: string;
}

export function NutrientTrend({ nutrient, dayKey, periodDays, target, unit, kind }: NutrientTrendProps) {
  const days = useAppStore((s) => s.days);
  const windowDays = trendWindow(periodDays);
  const full = nutrientSeries(days, dayKey, windowDays, nutrient);

  // Drop the empty run before the first logged day. Over a 90-day window
  // with three weeks of history, keeping it crammed every bar against the
  // right edge under three-quarters of blank chart, which reads as a
  // rendering fault rather than as "you started logging recently". Gaps
  // *within* the data are kept — those are real.
  const firstLogged = full.findIndex((p) => p.logged);
  const series = firstLogged < 0 ? full : full.slice(firstLogged);

  const logged = series.filter((p) => p.logged);
  if (logged.length < 2) {
    return <p className="trend-empty">Sin datos suficientes para una tendencia.</p>;
  }

  const average = logged.reduce((sum, p) => sum + p.value, 0) / logged.length;
  const scaleMax = Math.max(...series.map((p) => p.value), target ?? 0, 1) * 1.1;
  const barW = 100 / series.length;
  const y = (v: number) => H - (v / scaleMax) * H;

  return (
    <div className="trend">
      <svg
        className="trend-chart"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tendencia de ${nutrient}, ${windowDays} días`}
      >
        {series.map((p, i) =>
          p.logged ? (
            <rect
              key={p.date}
              x={i * barW + barW * 0.18}
              y={y(p.value)}
              width={barW * 0.64}
              height={Math.max(1, H - y(p.value))}
              className={"trend-bar is-" + kind}
            />
          ) : null
        )}
        {target != null && target > 0 && (
          <line x1="0" y1={y(target)} x2="100" y2={y(target)} className="trend-ref is-target" />
        )}
        <line x1="0" y1={y(average)} x2="100" y2={y(average)} className="trend-ref is-average" />
      </svg>
      <div className="trend-legend">
        <span className="trend-legend-item is-average">
          Media {unit === "kcal" || unit === "mg" ? Math.round(average) : Math.round(average * 10) / 10} {unit}
        </span>
        {target != null && target > 0 && (
          <span className="trend-legend-item is-target">Objetivo {Math.round(target)} {unit}</span>
        )}
        <span className="trend-legend-days">
          {logged.length}/{windowDays} días
        </span>
      </div>
    </div>
  );
}
