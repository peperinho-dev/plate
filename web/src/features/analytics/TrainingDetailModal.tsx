// Training over time, opened from the Entreno card in Análisis.
//
// The workouts equivalent of the Expenditure and Weight Trend details:
// the card states one figure, the sheet shows the series and what drove
// it. It replaces the Entreno card that sat in Historial — two places
// rendering the same chart was one too many — and moving it here gives
// the Análisis grid an even four.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { AxisChart, type ChartPoint } from "../../shared/components/AxisChart";
import { ChevronRight } from "../../shared/components/Icons";
import { useAppStore } from "../../shared/store";
import { getRecentDays } from "../../shared/lib/analytics";
import { formatDuration } from "../../shared/lib/workouts";
import { parseDateKey } from "../../shared/lib/date";
import { trainingSeries, volumeSplit, TRAINING_METRICS, type TrainingMetric } from "./trainingSeries";
import { topExercises } from "./exerciseTrend";

interface TrainingDetailModalProps {
  open: boolean;
  onClose: () => void;
  onPickExercise: (name: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [
  { id: "30", label: "30 d", days: 30 },
  { id: "90", label: "3 m", days: 90 },
  { id: "365", label: "1 año", days: 365 }
];

export function TrainingDetailModal({ open, onClose, onPickExercise }: TrainingDetailModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);
  const days = useAppStore((s) => s.days);
  const [metric, setMetric] = useState<TrainingMetric>("sets");
  const [rangeId, setRangeId] = useState("30");

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];
  const keys = getRecentDays(days, range.days).map((d) => d.date);
  const series = trainingSeries(workouts, keys, metric, weightLog);
  const split = volumeSplit(workouts, keys, weightLog);
  const spec = TRAINING_METRICS.find((m) => m.id === metric)!;
  const top = topExercises(workouts, keys, weightLog);

  // Sessions only. Including rest days would drag the line to the floor
  // between every workout — sawtooth noise, not a trend.
  const trained = series.filter((p) => p.trained);
  const points: ChartPoint[] = trained.map((p) => ({
    x: Math.round(parseDateKey(p.date).getTime() / DAY),
    y: p.value
  }));
  const total = trained.reduce((s, p) => s + p.value, 0);
  const average = trained.length ? total / trained.length : 0;

  const fmt = (v: number) => (metric === "hold" ? formatDuration(Math.round(v)) : `${Math.round(v)}`);
  const bwTotal = split.reduce((s, p) => s + p.bodyweight, 0);
  const resTotal = split.reduce((s, p) => s + p.resistance, 0);

  return (
    <Modal open={open} title="Entreno" onClose={onClose}>
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
      <div className="segmented segmented--compact">
        {TRAINING_METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={"segmented-btn" + (metric === m.id ? " active" : "")}
            onClick={() => setMetric(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="ss-totals">
        <div className="ss-total">
          <span className="ss-total-value">{trained.length}</span>
          <span className="ss-total-label">sesiones</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">{fmt(average)}</span>
          <span className="ss-total-label">media por sesión</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">{fmt(total)}</span>
          <span className="ss-total-label">total {spec.unit}</span>
        </div>
      </div>

      {trained.length < 2 ? (
        <p className="empty-state">Sin entrenos suficientes en este periodo.</p>
      ) : (
        <AxisChart
          series={[
            {
              id: metric,
              label: `${spec.label} por sesión`,
              points,
              color: "var(--accent)",
              endDot: true,
              markers: points
            }
          ]}
          formatY={fmt}
          formatX={(v) => {
            const d = new Date(v * DAY);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
        />
      )}

      {metric === "volume" && (bwTotal > 0 || resTotal > 0) && (
        <p className="modal-hint">
          {Math.round(bwTotal)} kg de peso corporal y {Math.round(resTotal)} kg de carga añadida.
        </p>
      )}

      <div className="section-head">
        <span className="section-title">Más entrenados</span>
      </div>
      <div className="log-list">
        {top.map((t) => (
          <div className="row" key={t.name}>
            <button type="button" className="row-main" onClick={() => onPickExercise(t.name)}>
              <span className="row-name">{t.name}</span>
              <span className="row-qty">
                {t.sets} {t.sets === 1 ? "serie" : "series"}
                {t.reps > 0 ? ` · ${t.reps} reps` : ""}
                {t.holdSeconds > 0 ? ` · ${formatDuration(t.holdSeconds)}` : ""}
              </span>
            </button>
            <span className="row-chevron">
              <ChevronRight />
            </span>
          </div>
        ))}
        {top.length === 0 && <p className="empty-state">Sin ejercicios en este periodo.</p>}
      </div>
    </Modal>
  );
}
