// Small multi-series line chart.
//
// Replaces the vanilla SVG string builders with a single reusable
// component: the weight chart is raw-plus-trend, the macro chart is three
// series, and both are the same shape underneath. Axis ticks are ported
// from the vanilla buildYAxis/buildXAxisDates functions, not invented —
// same left margin, same tick count, same date-thinning rule.
interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  /** Dashed is used for the smoothed trend line over raw weight. */
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  /** YYYY-MM-DD per point, same length/order as each series' values. */
  dates: string[];
  height?: number;
  /** Y-axis tick label formatter — integers for macros, one decimal for weight. */
  formatTick?: (v: number) => string;
}

const W = 300; // viewBox width; the SVG scales to its container
const LEFT_MARGIN = 32; // room for the Y-axis tick labels
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

export function LineChart({ series, dates, height = 150, formatTick = (v) => String(Math.round(v)) }: LineChartProps) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length < 2) return <p className="empty-state">Aún no hay suficientes datos.</p>;

  const min = Math.min(...all);
  const max = Math.max(...all);
  // A flat series would otherwise divide by zero and collapse the line.
  const span = max - min || 1;
  const plotW = W - LEFT_MARGIN;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const count = Math.max(...series.map((s) => s.values.length));

  const xFor = (i: number) => (count === 1 ? LEFT_MARGIN + plotW / 2 : (i / (count - 1)) * plotW + LEFT_MARGIN);
  const yFor = (v: number) => PAD_TOP + plotH - ((v - min) / span) * plotH;

  const tickCount = 3;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, t) => min + (span / tickCount) * t);

  const showEvery = dates.length > 10 ? Math.ceil(dates.length / 7) : 1;

  return (
    <>
      <div className="chart-legend">
        {series.map((s) => (
          <span className="chart-legend-item" key={s.label}>
            <span className="chart-legend-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ display: "block" }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={LEFT_MARGIN}
              y1={yFor(v)}
              x2={W}
              y2={yFor(v)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text x={LEFT_MARGIN - 6} y={yFor(v) + 3} fontSize={9} textAnchor="end" fill="var(--ink-faint)">
              {formatTick(v)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          // Gaps (null) break the path rather than drawing a straight line
          // through days with no data, which would imply readings we don't
          // have.
          let d = "";
          let penDown = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              penDown = false;
              return;
            }
            d += `${penDown ? "L" : "M"}${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)} `;
            penDown = true;
          });
          return (
            <path
              key={s.label}
              d={d.trim()}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "4 3" : undefined}
            />
          );
        })}

        {dates.map((date, i) => {
          if (i % showEvery !== 0 && i !== dates.length - 1) return null;
          const day = Number(date.slice(8, 10));
          return (
            <text key={date} x={xFor(i)} y={height - 4} fontSize={9} textAnchor="middle" fill="var(--ink-faint)">
              {day}
            </text>
          );
        })}
      </svg>
    </>
  );
}
