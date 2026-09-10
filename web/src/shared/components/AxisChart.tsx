// A line chart with labelled axes.
//
// Every chart in this app so far has been a sparkline: a shape with no
// numbers on it, which is fine inside a card that states the figure
// beside it. A detail screen is the opposite — you open it to read values
// off the chart, so it needs ticks, gridlines and a legend.
//
// Deliberately not preserveAspectRatio="none". The sparklines stretch
// their viewBox to fill, which is harmless for a bare path and ruinous
// here: it would squash the tick labels horizontally.
import type { ReactNode } from "react";

export interface ChartPoint {
  /** Day index or timestamp — any monotonic number. */
  x: number;
  y: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: ChartPoint[];
  /** CSS colour, usually a var(). */
  color: string;
  /** Pale interpolated raw data reads as background to the trend. */
  faint?: boolean;
  /** Mark the final point, which is the one the headline quotes. */
  endDot?: boolean;
}

interface AxisChartProps {
  series: ChartSeries[];
  formatY: (v: number) => string;
  formatX: (v: number) => string;
  /** Forces the y range wider than the data, e.g. to include a target. */
  includeY?: number[];
  height?: number;
  children?: ReactNode;
}

const W = 320;
const PAD = { top: 8, right: 6, bottom: 20, left: 34 };

/** ~4 intervals on a 1/2/2.5/5 ladder, so ticks land on readable numbers. */
function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

export function AxisChart({ series, formatY, formatX, includeY = [], height = 180 }: AxisChartProps) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="chart-empty">Sin datos suficientes.</p>;

  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...includeY];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  // A flat series would collapse to a zero-height band, so give it one.
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const padY = (rawMax - rawMin || Math.abs(rawMax) * 0.02 || 1) * 0.12;
  const yMin = rawMin - padY;
  const yMax = rawMax + padY;

  const px = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin || 1)) * (height - PAD.top - PAD.bottom);

  const yTicks = niceTicks(yMin, yMax);
  // Dates get evenly spaced ticks, not "nice" ones. A day index is a big
  // arbitrary number, so rounding it to a 1/2/5 ladder lands on a step of
  // fifty days and yields two labels across a quarter.
  const xCount = 4;
  const xTicks = Array.from({ length: xCount }, (_, i) =>
    Math.round(xMin + ((xMax - xMin) * i) / (xCount - 1))
  );

  return (
    <div className="axis-chart">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img"
           aria-label={series.map((s) => s.label).join(" y ")}>
        {yTicks.map((t) => (
          <g key={"y" + t}>
            <line className="axis-grid" x1={PAD.left} y1={py(t)} x2={W - PAD.right} y2={py(t)} />
            <text className="axis-label" x={PAD.left - 5} y={py(t)} textAnchor="end" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={"x" + t} className="axis-label" x={px(t)} y={height - 6} textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.id}>
            <path
              className={"axis-line" + (s.faint ? " is-faint" : "")}
              style={{ stroke: s.color }}
              d={s.points.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`).join(" ")}
            />
            {s.endDot && s.points.length > 0 && (
              <circle
                className="axis-dot"
                style={{ fill: s.color }}
                cx={px(s.points[s.points.length - 1].x)}
                cy={py(s.points[s.points.length - 1].y)}
                r={3}
              />
            )}
          </g>
        ))}
      </svg>

      <div className="axis-legend">
        {series.map((s) => (
          <span className="axis-legend-item" key={s.id}>
            <span className="axis-legend-dash" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
