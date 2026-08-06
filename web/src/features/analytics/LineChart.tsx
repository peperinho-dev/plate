// Multi-series chart backing both the Peso and Macros cards.
//
// Vanilla has two separate builders (buildWeightChart / buildMacroChart)
// that share buildYAxis + buildXAxisDates. This keeps that shared axis
// code in one place while exposing the handful of options where the two
// genuinely differ — the differences are meaningful, not incidental:
//
//   Peso   — scaled to the data's own min/max (weight near zero is not a
//            thing), with a 0.5 kg floor on the range so a flat week isn't
//            amplified into dramatic-looking noise. Raw weigh-ins are
//            drawn as dots, not a line, because consecutive weigh-ins
//            aren't continuous — the smoothed trend is the line.
//   Macros — zero-based. Grams *are* a magnitude, so starting the axis at
//            the data minimum would exaggerate day-to-day variation.
import { useId } from "react";
import { smoothPath, type Point } from "../../shared/lib/svgPath";

interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  /** Scatter instead of a connecting line — used for raw weigh-ins. */
  dots?: boolean;
  /** Catmull-Rom smoothing, matching vanilla's trend/macro curves. */
  smooth?: boolean;
  /** Gradient fill down to the baseline, under the weight trend. */
  area?: boolean;
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  /** YYYY-MM-DD per point, same length/order as each series' values. */
  dates: string[];
  height?: number;
  /** Y-axis tick label formatter — integers for macros, one decimal for weight. */
  formatTick?: (v: number) => string;
  /** "zero" for magnitudes (macros), "min" for values far from zero (weight). */
  baseline?: "zero" | "min";
  /** Smallest span the Y axis may cover, so flat data isn't magnified. */
  minRange?: number;
  /** Headroom above the peak, as a multiplier. Vanilla uses 1.1 for macros. */
  maxScale?: number;
  tickCount?: number;
}

const W = 300; // viewBox width; the SVG scales to its container
const LEFT_MARGIN = 32; // room for the Y-axis tick labels
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

export function LineChart({
  series,
  dates,
  height = 150,
  formatTick = (v) => String(Math.round(v)),
  baseline = "min",
  minRange = 0,
  maxScale = 1,
  tickCount = 3
}: LineChartProps) {
  // Gradient ids must be unique per instance or two charts on the same
  // screen resolve the same url(#...) and share one fill.
  const gradientId = useId();

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length < 2) return <p className="empty-state">Aún no hay suficientes datos.</p>;

  const dataMax = Math.max(...all) * maxScale;
  const min = baseline === "zero" ? 0 : Math.min(...all);
  // Positioning uses the floored span; the tick *labels* still read the
  // real data extremes, so the top label is a weight actually recorded
  // rather than an artefact of the floor. Same split as app.js, which
  // passes maxV/minV to buildYAxis but scales y by the floored range.
  const span = Math.max(dataMax - min, minRange, 0.0001);

  const plotW = W - LEFT_MARGIN;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const count = Math.max(...series.map((s) => s.values.length));

  const xFor = (i: number) => (count === 1 ? LEFT_MARGIN + plotW / 2 : (i / (count - 1)) * plotW + LEFT_MARGIN);
  const yFor = (v: number) => PAD_TOP + plotH - ((v - min) / span) * plotH;

  const yTicks = Array.from(
    { length: tickCount + 1 },
    (_, t) => min + ((dataMax - min) / tickCount) * t
  );
  const showEvery = dates.length > 10 ? Math.ceil(dates.length / 7) : 1;
  const chartBottom = height - PAD_BOTTOM;

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
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line x1={LEFT_MARGIN} y1={yFor(v)} x2={W} y2={yFor(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={LEFT_MARGIN - 6} y={yFor(v) + 3} fontSize={9} textAnchor="end" fill="var(--ink-faint)">
              {formatTick(v)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          if (s.dots) {
            return (
              <g key={s.label}>
                {s.values.map((v, i) =>
                  v === null ? null : (
                    <circle key={i} cx={xFor(i)} cy={yFor(v)} r={2.5} fill={s.color} />
                  )
                )}
              </g>
            );
          }

          // A null breaks the path rather than drawing a straight line
          // through days with no data, which would imply readings we don't
          // have. Each unbroken run is smoothed on its own.
          const runs: Point[][] = [];
          let current: Point[] = [];
          s.values.forEach((v, i) => {
            if (v === null) {
              if (current.length) runs.push(current);
              current = [];
              return;
            }
            current.push({ x: xFor(i), y: yFor(v) });
          });
          if (current.length) runs.push(current);

          const pathFor = (pts: Point[]) =>
            s.smooth
              ? smoothPath(pts)
              : pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

          return (
            <g key={s.label}>
              {s.area &&
                runs.map((pts, ri) =>
                  pts.length < 2 ? null : (
                    <path
                      key={`a${ri}`}
                      d={`${pathFor(pts)} L${pts[pts.length - 1].x.toFixed(1)},${chartBottom} L${pts[0].x.toFixed(1)},${chartBottom} Z`}
                      fill={`url(#${gradientId})`}
                      stroke="none"
                    />
                  )
                )}
              {runs.map((pts, ri) => (
                <path
                  key={`l${ri}`}
                  d={pathFor(pts)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
              ))}
            </g>
          );
        })}

        {dates.map((date, i) => {
          if (i % showEvery !== 0 && i !== dates.length - 1) return null;
          return (
            <text key={date} x={xFor(i)} y={height - 4} fontSize={9} textAnchor="middle" fill="var(--ink-faint)">
              {Number(date.slice(8, 10))}
            </text>
          );
        })}
      </svg>
    </>
  );
}
