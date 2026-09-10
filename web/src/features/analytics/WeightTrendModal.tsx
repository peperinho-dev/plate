// Weight Trend as a screen you can read numbers off, not just a shape.
//
// Two series, as article 21 describes: the raw scale weight, gap-filled by
// linear interpolation so a missed morning doesn't break the line, drawn
// pale; and the smoothed trend over it. The headline quotes the trend,
// because that's the number that means something — scale weight on any
// given day is mostly water.
//
// The raw entries are listed underneath and can be removed, which is the
// other half of what their Scale Weight tile does. Adding is left to the
// existing weight sheet rather than duplicated here.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { AxisChart, type ChartPoint } from "../../shared/components/AxisChart";
import { XIcon } from "../../shared/components/Icons";
import { useAppStore } from "../../shared/store";
import { computeEma } from "../profile/adaptive";
import { trendRatePerWeek } from "./expenditure";
import { removeWeightEntry } from "../profile/actions";
import { formatShortDate } from "../../shared/lib/format";
import { parseDateKey } from "../../shared/lib/date";

interface WeightTrendModalProps {
  open: boolean;
  onClose: () => void;
}

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: "30", label: "30 d", days: 30 },
  { id: "90", label: "3 m", days: 90 },
  { id: "365", label: "1 año", days: 365 },
  { id: "all", label: "Todo", days: null }
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * One point per day between the first and last weigh-in, with gaps filled
 * on the straight line between neighbours — the interpolation article 21
 * describes. Without it a fortnight's gap draws as one long diagonal that
 * looks like data.
 */
function interpolateDaily(entries: { date: string; weightKg: number }[]): ChartPoint[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dayOf = (d: string) => Math.round(parseDateKey(d).getTime() / DAY);
  const out: ChartPoint[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const da = dayOf(a.date);
    const db = dayOf(b.date);
    for (let d = da; d < db; d++) {
      const t = db === da ? 0 : (d - da) / (db - da);
      out.push({ x: d, y: a.weightKg + (b.weightKg - a.weightKg) * t });
    }
  }
  const last = sorted[sorted.length - 1];
  out.push({ x: dayOf(last.date), y: last.weightKg });
  return out;
}

export function WeightTrendModal({ open, onClose }: WeightTrendModalProps) {
  const weightLog = useAppStore((s) => s.weightLog);
  const [rangeId, setRangeId] = useState("90");

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[1];
  const cutoff = range.days == null ? null : Date.now() - range.days * DAY;
  const inRange = weightLog.filter(
    (e) => cutoff == null || parseDateKey(e.date).getTime() >= cutoff
  );
  const sorted = [...inRange].sort((a, b) => (a.date < b.date ? -1 : 1));

  const raw = interpolateDaily(sorted);
  const ema = computeEma(sorted);
  const dayOf = (d: string) => Math.round(parseDateKey(d).getTime() / DAY);
  const trendPoints: ChartPoint[] = ema.map((p) => ({ x: dayOf(p.date), y: p.ema }));

  const currentTrend = ema.length ? ema[ema.length - 1].ema : null;
  const rate = trendRatePerWeek(ema);
  // The goal weight is deliberately absent from the y range. Forcing the
  // axis down to 74 when the data sits between 77.8 and 79.7 spent two
  // thirds of the chart on empty space and flattened the trend into a
  // horizontal smear — the one thing this screen exists to show. Progress
  // toward the goal is the Progreso card's job.

  const fmtX = (v: number) => {
    const d = new Date(v * DAY);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <Modal open={open} title="Tendencia de peso" onClose={onClose}>
      <div className="segmented segmented--compact">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={"segmented-btn" + (r.id === rangeId ? " active" : "")}
            onClick={() => setRangeId(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="ss-totals">
        <div className="ss-total">
          <span className="ss-total-value">{currentTrend == null ? "—" : currentTrend.toFixed(1)}</span>
          <span className="ss-total-label">kg tendencia</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">
            {rate == null ? "—" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)}`}
          </span>
          <span className="ss-total-label">kg/semana</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">{sorted.length}</span>
          <span className="ss-total-label">pesajes</span>
        </div>
      </div>

      <AxisChart
        series={[
          {
            id: "raw",
            label: "Peso en báscula",
            points: raw,
            color: "var(--ink-faint)",
            faint: true
          },
          {
            id: "trend",
            label: "Tendencia",
            points: trendPoints,
            color: "var(--accent)",
            endDot: true
          }
        ]}
        formatY={(v) => v.toFixed(1)}
        formatX={fmtX}
      />

      <div className="section-head">
        <span className="section-title">Pesajes</span>
      </div>
      <div className="log-list">
        {[...sorted].reverse().map((e) => (
          <div className="row" key={e.date}>
            <div className="row-main">
              <span className="row-name">{e.weightKg.toFixed(1)} kg</span>
              <span className="row-qty">{formatShortDate(e.date)}</span>
            </div>
            <button
              type="button"
              className="row-del"
              aria-label={`Quitar el pesaje del ${formatShortDate(e.date)}`}
              onClick={() => removeWeightEntry(e.date)}
            >
              <XIcon />
            </button>
          </div>
        ))}
        {sorted.length === 0 && <p className="empty-state">Sin pesajes en este periodo.</p>}
      </div>
    </Modal>
  );
}
