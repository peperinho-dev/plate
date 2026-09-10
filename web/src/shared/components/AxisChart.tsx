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
import { useRef, useState, type ReactNode } from "react";

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
  /**
   * Points to mark with a dot. Separate from `points` because a line can
   * be denser than its evidence: the weight line is interpolated to one
   * point per day, but only some of those days were actually weighed, and
   * a dot on every day would claim readings that were never taken.
   */
  markers?: ChartPoint[];
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
// Y labels sit on the right, as they do in the reference app's charts:
// the line starts at the left edge, so the numbers don't crowd its
// beginning, and the eye finds them where the most recent values are.
const PAD = { top: 8, right: 34, bottom: 20, left: 6 };

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
  // Scrubbing: drag across the chart to read exact values off it, the way
  // article 18 describes long-pressing their charts. No long-press delay
  // here — the chart doesn't scroll horizontally, so a drag can't be
  // mistaken for one, and making people wait for a value they can see is
  // a delay with nothing to buy.
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrubX, setScrubX] = useState<number | null>(null);
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

  const plotW = W - PAD.left - PAD.right;
  const px = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const xAt = (ratio: number) => xMin + ratio * (xMax - xMin);
  const py = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin || 1)) * (height - PAD.top - PAD.bottom);

  const yTicks = niceTicks(yMin, yMax);
  // Dates get evenly spaced ticks, not "nice" ones. A day index is a big
  // arbitrary number, so rounding it to a 1/2/5 ladder lands on a step of
  // fifty days and yields two labels across a quarter.
  const xCount = 4;
  const xTicks = Array.from({ length: xCount }, (_, i) =>
    Math.round(xMin + ((xMax - xMin) * i) / (xCount - 1))
  );

  // Nearest actual point per series, so the readout quotes real data
  // rather than interpolating between the plotted vertices.
  const scrubbed =
    scrubX == null
      ? null
      : series
          .map((s) => {
            let best: ChartPoint | null = null;
            for (const p of s.points) {
              if (!best || Math.abs(p.x - scrubX) < Math.abs(best.x - scrubX)) best = p;
            }
            return best ? { series: s, point: best } : null;
          })
          .filter((v): v is { series: ChartSeries; point: ChartPoint } => v !== null);

  const onScrub = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / r.width;
    // The plot is inset from the svg, so the pointer maps through the
    // plot box, not the full width — otherwise the readout drifts by the
    // padding at both ends.
    const plotRatio = (ratio * W - PAD.left) / plotW;
    setScrubX(xAt(Math.max(0, Math.min(1, plotRatio))));
  };

  return (
    <div className="axis-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={series.map((s) => s.label).join(" y ")}
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onScrub(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          if (scrubX != null) onScrub(e.clientX);
        }}
        onPointerUp={() => setScrubX(null)}
        onPointerCancel={() => setScrubX(null)}
      >
        {yTicks.map((t) => (
          <g key={"y" + t}>
            <line className="axis-grid" x1={PAD.left} y1={py(t)} x2={W - PAD.right} y2={py(t)} />
            <text className="axis-label" x={W - PAD.right + 5} y={py(t)} textAnchor="start" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={"x" + t} className="axis-label" x={px(t)} y={height - 6} textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
        {scrubbed && scrubbed.length > 0 && (
          <line
            className="axis-scrub"
            x1={px(scrubbed[0].point.x)}
            y1={PAD.top}
            x2={px(scrubbed[0].point.x)}
            y2={height - PAD.bottom}
          />
        )}
        {series.map((s) => (
          <g key={s.id}>
            <path
              className={"axis-line" + (s.faint ? " is-faint" : "")}
              style={{ stroke: s.color }}
              d={s.points.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`).join(" ")}
            />
            {s.markers?.map((mk, i) => (
              <circle
                key={"m" + i}
                className="axis-marker"
                style={{ fill: s.color }}
                cx={px(mk.x)}
                cy={py(mk.y)}
                r={2}
              />
            ))}
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
        {scrubbed?.map((v) => (
          <circle
            key={"sc" + v.series.id}
            className="axis-scrub-dot"
            style={{ fill: v.series.color }}
            cx={px(v.point.x)}
            cy={py(v.point.y)}
            r={3.5}
          />
        ))}
      </svg>

      {/* Replaces the legend while scrubbing rather than sitting beside
          it: the two say the same thing, and stacking them would make the
          chart jump taller the moment you touched it. */}
      {scrubbed && scrubbed.length > 0 ? (
        <div className="axis-readout">
          <span className="axis-readout-x">{formatX(scrubbed[0].point.x)}</span>
          {scrubbed.map((v) => (
            <span className="axis-readout-item" key={"r" + v.series.id}>
              <span className="axis-legend-dash" style={{ background: v.series.color }} />
              {formatY(v.point.y)}
            </span>
          ))}
        </div>
      ) : (
      <div className="axis-legend">
        {series.map((s) => (
          <span className="axis-legend-item" key={s.id}>
            <span className="axis-legend-dash" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      )}
    </div>
  );
}
