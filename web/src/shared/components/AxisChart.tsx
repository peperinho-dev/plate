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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { niceTicks } from "../lib/chart";

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
   * Fill the area under the line. A bare stroke reads as a wire laid over
   * the card; a filled one reads as a quantity. Off by default because a
   * chart with two series can only afford one fill before the overlap
   * turns both to mud — fill the series the headline quotes.
   */
  area?: boolean;
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

export function AxisChart({ series, formatY, formatX, includeY = [], height = 180 }: AxisChartProps) {
  // Scrubbing: drag across the chart to read exact values off it, the way
  // article 18 describes long-pressing their charts. No long-press delay
  // here — the chart doesn't scroll horizontally, so a drag can't be
  // mistaken for one, and making people wait for a value they can see is
  // a delay with nothing to buy.
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrubX, setScrubX] = useState<number | null>(null);
  // The window currently in view, in x units. Null is the whole series —
  // kept as null rather than as the full bounds so "am I zoomed?" is one
  // check and resetting can't drift by a rounding error.
  const [view, setView] = useState<{ lo: number; hi: number } | null>(null);
  // Live pointer positions by id. Two down means a pinch, which takes over
  // from scrubbing: you cannot be reading a value and resizing the axis at
  // the same time, and trying to do both makes the readout jump.
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<{ dist: number; lo: number; hi: number; mid: number } | null>(null);
  // A one-finger drag while zoomed scrolls the window sideways. Held as a
  // snapshot of where the drag started so the pan tracks the finger
  // exactly rather than accumulating per-move rounding.
  const pan = useRef<{ x: number; lo: number; hi: number } | null>(null);
  const panned = useRef(false);
  const clipId = useId();

  const all = series.flatMap((s) => s.points);

  const xs = all.length ? all.map((p) => p.x) : [0, 1];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const fullSpan = xMax - xMin || 1;
  const domLo = view ? view.lo : xMin;
  const domHi = view ? view.hi : xMax;
  const domSpan = domHi - domLo || 1;

  const plotW = W - PAD.left - PAD.right;

  /**
   * Zooms about a point, given as a 0–1 ratio across the plot.
   *
   * Everything is derived from `base` rather than from the live view, so a
   * continuous pinch stays anchored to where the fingers landed instead of
   * compounding its own output frame after frame.
   */
  const zoomAbout = (factor: number, focus: number, base?: { lo: number; hi: number }) => {
    const from = base ?? { lo: domLo, hi: domHi };
    const span = from.hi - from.lo || 1;
    // Not past a fiftieth of the series: below that the line is two points
    // and a lot of empty axis.
    const minSpan = fullSpan / 50;
    const next = Math.min(Math.max(span * factor, minSpan), fullSpan);
    const anchor = from.lo + focus * span;
    let lo = anchor - focus * next;
    if (lo < xMin) lo = xMin;
    if (lo + next > xMax) lo = xMax - next;
    setView(next >= fullSpan - fullSpan * 1e-6 ? null : { lo, hi: lo + next });
  };

  /** Slides the window by a fraction of its own width, clamped to the data. */
  const panBy = (ratioOfSpan: number, base: { lo: number; hi: number }) => {
    const span = base.hi - base.lo;
    let lo = base.lo + ratioOfSpan * span;
    if (lo < xMin) lo = xMin;
    if (lo + span > xMax) lo = xMax - span;
    setView({ lo, hi: lo + span });
  };

  /** Where a client x lands across the plot box, 0–1. */
  const plotRatio = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return 0.5;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / r.width;
    return Math.max(0, Math.min(1, (ratio * W - PAD.left) / plotW));
  };

  // Wheel and trackpad pinch, bound by hand because React's onWheel is
  // passive: preventDefault there is ignored, and the page scrolls away
  // underneath while you are trying to zoom.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      zoomAbout(e.deltaY > 0 ? 1.18 : 1 / 1.18, plotRatio(e.clientX));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (all.length < 2) return <p className="chart-empty">Sin datos suficientes.</p>;

  // The y range follows the window, so zooming into a flat stretch opens
  // it up instead of leaving it pinned flat against a year's worth of
  // range. Points just outside the window are included so the line enters
  // and leaves the frame at the right height.
  const margin = domSpan * 0.02;
  const visible = all.filter((p) => p.x >= domLo - margin && p.x <= domHi + margin);
  const ys = [...(visible.length >= 2 ? visible : all).map((p) => p.y), ...includeY];
  // A flat series would collapse to a zero-height band, so give it one.
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const padY = (rawMax - rawMin || Math.abs(rawMax) * 0.02 || 1) * 0.12;
  const yMin = rawMin - padY;
  const yMax = rawMax + padY;

  const px = (x: number) => PAD.left + ((x - domLo) / domSpan) * plotW;
  const xAt = (ratio: number) => domLo + ratio * domSpan;
  const py = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin || 1)) * (height - PAD.top - PAD.bottom);

  const yTicks = niceTicks(yMin, yMax);
  // Dates get evenly spaced ticks, not "nice" ones. A day index is a big
  // arbitrary number, so rounding it to a 1/2/5 ladder lands on a step of
  // fifty days and yields two labels across a quarter.
  const xCount = 4;
  const xTicks = Array.from({ length: xCount }, (_, i) =>
    Math.round(domLo + (domSpan * i) / (xCount - 1))
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
    const pr = (ratio * W - PAD.left) / plotW;
    setScrubX(xAt(Math.max(0, Math.min(1, pr))));
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
          // Throws NotFoundError when the pointer isn't one the browser is
          // tracking — which is every synthetic event, and so every
          // automated test of this chart. Not worth taking the handler down.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* capture is an optimisation here, not a requirement */
          }
          pointers.current.set(e.pointerId, e.clientX);
          panned.current = false;
          if (view) pan.current = { x: e.clientX, lo: view.lo, hi: view.hi };
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { dist: Math.abs(a - b) || 1, lo: domLo, hi: domHi, mid: (a + b) / 2 };
            // A pinch is not a reading gesture; drop the scrub line.
            setScrubX(null);
          } else if (pointers.current.size === 1) {
            onScrub(e.clientX);
          }
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, e.clientX);
          if (pointers.current.size >= 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.abs(a - b) || 1;
            const start = pinch.current;
            // Fingers apart shrinks the window; the anchor is where the
            // pinch began, and the same two fingers moving together drag
            // the window sideways, so zoom and pan are one gesture.
            const midShift = ((a + b) / 2 - start.mid) / (svgRef.current?.getBoundingClientRect().width || W);
            const span = start.hi - start.lo;
            const shifted = { lo: start.lo - midShift * span, hi: start.hi - midShift * span };
            zoomAbout(start.dist / dist, plotRatio(start.mid), shifted);
            return;
          }
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          // Zoomed in, a horizontal drag scrolls rather than reads. The
          // threshold keeps a tap-and-hold reading a value instead of
          // nudging the window by three pixels.
          if (pan.current) {
            const width = svgRef.current?.getBoundingClientRect().width || W;
            const dx = e.clientX - pan.current.x;
            if (panned.current || Math.abs(dx) > 6) {
              panned.current = true;
              setScrubX(null);
              panBy(-dx / width, pan.current);
              return;
            }
          }
          if (scrubX != null) onScrub(e.clientX);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (pointers.current.size === 0) pan.current = null;
          setScrubX(null);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (pointers.current.size === 0) pan.current = null;
          setScrubX(null);
        }}
      >
        <defs>
          {/* Zoomed in, the line runs well past both edges; without this
              it draws over the y labels and out of the card. */}
          <clipPath id={clipId}>
            <rect x={PAD.left} y={0} width={plotW} height={height} />
          </clipPath>
        </defs>
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
          <g key={s.id} clipPath={`url(#${clipId})`}>
            {s.area && s.points.length > 1 && (
              <path
                className="axis-area"
                style={{ fill: s.color }}
                d={
                  s.points.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`).join(" ") +
                  ` L${px(s.points[s.points.length - 1].x).toFixed(2)} ${height - PAD.bottom}` +
                  ` L${px(s.points[0].x).toFixed(2)} ${height - PAD.bottom} Z`
                }
              />
            )}
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
            clipPath={`url(#${clipId})`}
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
        {/* Only present while zoomed. A reset that is always there implies
            the chart is in a mode, when most of the time it just isn't. */}
        {view && (
          <button type="button" className="axis-reset" onClick={() => setView(null)}>
            Ver todo
          </button>
        )}
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
