// One exercise over time, reached from the top-exercises list.
//
// The chart's metric follows the movement: kilos for weighted work, reps
// for bodyweight, seconds for holds. Charting volume for a plank would
// draw a flat line and call it a plateau.
import { Modal } from "../../shared/components/Modal";
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

  if (!name) return null;
  const { points, metric } = exerciseHistory(workouts, name, weightLog);
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
