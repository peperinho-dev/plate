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
