// Small multi-series line chart.
//
// Replaces the vanilla SVG string builders with a single reusable
// component: the weight chart is raw-plus-trend, the macro chart is three
// series, and both are the same shape underneath.
interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  /** Dashed is used for the smoothed trend line over raw weight. */
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  height?: number;
}

const W = 300; // viewBox width; the SVG scales to its container

export function LineChart({ series, height = 120 }: LineChartProps) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length < 2) return <p className="empty-state">Aún no hay suficientes datos.</p>;

  const min = Math.min(...all);
  const max = Math.max(...all);
  // A flat series would otherwise divide by zero and collapse the line.
  const span = max - min || 1;
  const pad = 6;
  const plotH = height - pad * 2;
  const count = Math.max(...series.map((s) => s.values.length));

  const xFor = (i: number) => (count === 1 ? W / 2 : (i / (count - 1)) * W);
  const yFor = (v: number) => pad + plotH - ((v - min) / span) * plotH;

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
      </svg>
    </>
  );
}
