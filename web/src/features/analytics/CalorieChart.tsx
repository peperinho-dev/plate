// Daily calorie bars, ported from buildCalorieChart() in app.js.
//
// Kept as a real charted axis rather than the plain flex bars an earlier
// pass substituted: the two reference marks are the whole point of this
// card. The shaded band is the target range, so "did I land inside it" is
// readable at a glance, and the dashed line is estimated maintenance —
// bars above it are a surplus that day, below a deficit. Without those,
// bar heights are just relative to each other and say nothing.
import type { DayStat } from "../../shared/lib/analytics";

interface CalorieChartProps {
  days: DayStat[];
  min: number;
  max: number;
  /** Estimated maintenance calories, or null when the profile is incomplete. */
  expenditure: number | null;
}

const W = 300;
const LEFT_MARGIN = 32;
const H = 150;
const PAD_TOP = 6;
const PAD_BOTTOM = 20;

export function CalorieChart({ days, min, max, expenditure }: CalorieChartProps) {
  if (days.length === 0) return <p className="empty-state">Aún no hay suficientes datos.</p>;

  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const plotW = W - LEFT_MARGIN;
  const barW = plotW / days.length;
  const maxVal =
    Math.max(max || 0, expenditure || 0, ...days.map((d) => d.total), 1) * 1.08;

  const yFor = (v: number) => PAD_TOP + chartH - (v / maxVal) * chartH;
  const xFor = (i: number) => LEFT_MARGIN + i * barW + barW / 2;

  const tickCount = 3;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, t) => (maxVal / tickCount) * t);
  const showEvery = days.length > 10 ? Math.ceil(days.length / 7) : 1;

  return (
    <>
      {expenditure ? (
        <div className="chart-legend">
          <span className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: "var(--accent)" }} />
            Ingesta
          </span>
          <span className="chart-legend-item">
            <span className="chart-legend-dash" />
            Gasto est.
          </span>
        </div>
      ) : null}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="calorieBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line x1={LEFT_MARGIN} y1={yFor(v)} x2={W} y2={yFor(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={LEFT_MARGIN - 6} y={yFor(v) + 3} fontSize={9} textAnchor="end" fill="var(--ink-faint)">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {max > min && (
          <rect
            x={LEFT_MARGIN}
            y={yFor(max)}
            width={plotW}
            height={yFor(min) - yFor(max)}
            fill="var(--accent-soft)"
          />
        )}

        {days.map((d, i) => {
          const barH = (d.total / maxVal) * chartH;
          const inRange = d.total >= min && d.total <= max;
          const fill =
            d.total === 0 ? "var(--line)" : inRange ? "url(#calorieBarGradient)" : "var(--ink-faint)";
          return (
            <rect
              key={d.date}
              x={LEFT_MARGIN + i * barW + barW * 0.18}
              y={PAD_TOP + chartH - barH}
              width={barW * 0.64}
              height={Math.max(1.5, barH)}
              rx={3}
              fill={fill}
            />
          );
        })}

        {expenditure ? (
          <line
            x1={LEFT_MARGIN}
            y1={yFor(expenditure)}
            x2={W}
            y2={yFor(expenditure)}
            stroke="var(--ink)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ) : null}

        {days.map((d, i) => {
          if (i % showEvery !== 0 && i !== days.length - 1) return null;
          return (
            <text
              key={d.date}
              x={xFor(i)}
              y={H - 4}
              fontSize={9}
              textAnchor="middle"
              fill="var(--ink-faint)"
            >
              {Number(d.date.slice(8, 10))}
            </text>
          );
        })}
      </svg>
    </>
  );
}
