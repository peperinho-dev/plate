// Axis maths shared by the charts.
//
// Lives here rather than in AxisChart so a chart that isn't a line chart
// can label its axis the same way — the weekly waterfall in Progreso
// needs identical ticks and would otherwise either duplicate this or go
// without numbers, which is what it did at first.

/** ~4 intervals on a 1/2/2.5/5 ladder, so ticks land on readable numbers. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/**
 * The one set of windows every detail chart offers.
 *
 * These had drifted apart: weight offered 30 d / 3 m / 1 año / Todo,
 * expenditure 60 d / 4 m / 1 año, training 30 d / 3 m / 1 año, and the
 * per-exercise chart offered nothing at all. None of that was deliberate —
 * there is no reason the same question ("how far back?") should have a
 * different answer depending on which card you opened.
 *
 * `days: null` means the whole history.
 */
export interface ChartRange {
  id: string;
  label: string;
  days: number | null;
}

export const CHART_RANGES: ChartRange[] = [
  { id: "30", label: "30 d", days: 30 },
  { id: "90", label: "3 m", days: 90 },
  { id: "365", label: "1 año", days: 365 },
  { id: "all", label: "Todo", days: null }
];

export function findRange(id: string, fallback = "90"): ChartRange {
  return (
    CHART_RANGES.find((r) => r.id === id) ??
    CHART_RANGES.find((r) => r.id === fallback) ??
    CHART_RANGES[1]
  );
}
