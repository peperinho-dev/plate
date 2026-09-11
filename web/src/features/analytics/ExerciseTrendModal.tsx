// One exercise over time, reached from the top-exercises list.
//
// The chart's metric follows the movement: kilos for weighted work, reps
// for bodyweight, seconds for holds. Charting volume for a plank would
// draw a flat line and call it a plateau.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { CHART_RANGES, findRange } from "../../shared/lib/chart";
import { AxisChart, type ChartPoint } from "../../shared/components/AxisChart";
import { useAppStore } from "../../shared/store";
import { exerciseHistory } from "./exerciseTrend";
import { formatDuration } from "../../shared/lib/workouts";
import { parseDateKey } from "../../shared/lib/date";
import { formatShortDate } from "../../shared/lib/format";

interface ExerciseTrendModalProps {
  open: boolean;
  name: string | null;
  onClose: () => void;
}

const DAY = 24 * 60 * 60 * 1000;

const UNITS: Record<string, { label: string; fmt: (v: number) => string }> = {
  volume: { label: "Volumen por sesión", fmt: (v) => `${Math.round(v)}` },
  reps: { label: "Reps por sesión", fmt: (v) => `${Math.round(v)}` },
  hold: { label: "Tiempo por sesión", fmt: (v) => formatDuration(Math.round(v)) }
};

export function ExerciseTrendModal({ open, name, onClose }: ExerciseTrendModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);

  // This chart had no window control at all, which made it the one place
  // you could not ask "how far back?" — with a year of sessions behind a
  // movement, that is exactly where the question matters most.
  const [rangeId, setRangeId] = useState("90");
  const range = findRange(rangeId);

  if (!name) return null;
  const { points: allPoints, metric } = exerciseHistory(workouts, name, weightLog);
  const cutoffDay =
    range.days == null ? null : Math.round((Date.now() - range.days * DAY) / DAY);
  const points = allPoints.filter(
    (p) => cutoffDay == null || Math.round(parseDateKey(p.date).getTime() / DAY) >= cutoffDay
  );
  const unit = UNITS[metric];

  const chart: ChartPoint[] = points.map((p) => ({
    x: Math.round(parseDateKey(p.date).getTime() / DAY),
    y: p.value
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  return (
    <Modal open={open} title={name} onClose={onClose}>
      <div className="segmented segmented--compact">
        {CHART_RANGES.map((r) => (
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
          <span className="ss-total-value">{points.length}</span>
          <span className="ss-total-label">sesiones</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">{last ? last.bestLabel : "—"}</span>
          <span className="ss-total-label">mejor serie</span>
        </div>
        <div className="ss-total">
          <span className={"ss-total-value" + (change != null && change > 0 ? " is-up" : "")}>
            {change == null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change)}%`}
          </span>
          <span className="ss-total-label">desde el inicio</span>
        </div>
      </div>

      <AxisChart
        series={[{ id: metric, label: unit.label, points: chart, color: "var(--metric-training)", endDot: true, area: true, markers: chart }]}
        formatY={unit.fmt}
        formatX={(v) => {
          const d = new Date(v * DAY);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        }}
      />

      <div className="section-head">
        <span className="section-title">Sesiones</span>
      </div>
      <div className="log-list">
        {[...points].reverse().map((p) => (
          <div className="row" key={p.date}>
            <div className="row-main">
              <span className="row-name">{p.bestLabel}</span>
              <span className="row-qty">
                {formatShortDate(p.date)} · {unit.fmt(p.value)} {metric === "volume" ? "kg" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
