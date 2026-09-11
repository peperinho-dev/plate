// Goal Progress as a screen, matching the reference app's: the headline
// figure says how far there is to go, and this says how the going has
// actually gone, week by week.
//
// The card it opens from can only state a total ("4.3 kg para 74.0"),
// which is the least actionable form of the number — it looks identical
// whether you gained steadily for a month or gained nothing for three
// weeks and then a kilo overnight. A week is the unit a weight goal is
// actually lived in, so that's the unit this charts.
import { Modal } from "../../shared/components/Modal";
import { useAppStore } from "../../shared/store";
import { computeEma } from "../profile/adaptive";
import {
  readGoal,
  goalWeeks,
  targetWeeklyRate,
  goalTimeline,
  MAINTAIN_BAND_KG,
  type GoalWeek
} from "./goal";
import { formatShortDate, formatGoalDate } from "../../shared/lib/format";
import { niceTicks } from "../../shared/lib/chart";

interface GoalProgressModalProps {
  open: boolean;
  onClose: () => void;
}

// Same geometry as AxisChart, so the two detail screens read as one
// family: y labels on the right, dashed gridlines, ticks on a nice ladder.
const W = 320;
const CHART_H = 150;
const PAD = { top: 8, right: 34, bottom: 20, left: 6 };

/** Signed kg, always with its sign, because the direction is the point. */
function signed(kg: number, digits = 2): string {
  return `${kg > 0 ? "+" : kg < 0 ? "\u2212" : ""}${Math.abs(kg).toFixed(digits)}`;
}

/**
 * One bar per week, measured from a zero line: a week is a signed change,
 * so a chart that drew a −0.2 kg week and a +0.2 kg week at the same
 * height would hide the only thing worth seeing.
 *
 * The first version of this had no axis at all — no ticks, no gridlines,
 * no dates — which made the bar heights unreadable and the whole thing a
 * shape rather than a measurement. A detail screen is exactly where the
 * numbers belong.
 */
function WeeklyWaterfall({ weeks, targetRate }: { weeks: GoalWeek[]; targetRate: number | null }) {
  if (weeks.length === 0) return null;

  // The y range covers the bars, the zero line and the target line, then
  // lets zero sit wherever it falls inside that. Centring zero instead
  // would be symmetrical and wrong: a cut only ever produces negative
  // weeks, so half the chart was empty and every bar squashed into the
  // other half.
  const values = [...weeks.map((w) => w.change), 0];
  if (targetRate != null) values.push(targetRate);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin || 0.2) * 0.15;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const py = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  const zeroY = py(0);

  const slot = plotW / weeks.length;
  const barW = Math.min(slot * 0.55, 26);

  // Anything within a tenth of the aim counts as hitting it; a bar that
  // lands 40 g short is not a week you did anything wrong.
  const onTarget = (change: number) =>
    targetRate == null
      ? true
      : Math.sign(change) === Math.sign(targetRate) && Math.abs(change) >= Math.abs(targetRate) - 0.1;

  return (
    <div className="axis-chart">
      <svg viewBox={`0 0 ${W} ${CHART_H}`} width="100%" height={CHART_H}
           role="img" aria-label="Cambio de peso por semana">
        {niceTicks(yMin, yMax).map((t) => (
          <g key={"y" + t}>
            <line className="axis-grid" x1={PAD.left} y1={py(t)} x2={W - PAD.right} y2={py(t)} />
            <text className="axis-label" x={W - PAD.right + 5} y={py(t)}
                  textAnchor="start" dominantBaseline="middle">
              {signed(t, 1)}
            </text>
          </g>
        ))}
        {/* Zero is the baseline the bars are measured from, not a
            reference like the gridlines, so it draws solid. */}
        <line className="gp-zero" x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} />
        {targetRate != null && (
          <line className="gp-ref" x1={PAD.left} y1={py(targetRate)} x2={W - PAD.right} y2={py(targetRate)} />
        )}
        {weeks.map((w, i) => {
          const cx = PAD.left + i * slot + slot / 2;
          const top = Math.min(zeroY, py(w.change));
          const h = Math.abs(py(w.change) - zeroY);
          return (
            <g key={w.weekStart}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={Math.max(h, 1)}
                className={"gp-bar" + (onTarget(w.change) ? " is-on" : " is-off")}
              />
              <text className="axis-label" x={cx} y={CHART_H - 6} textAnchor="middle">
                {formatShortDate(w.weekStart)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="trend-legend">
        <span className="gp-legend-item is-on">En objetivo</span>
        <span className="gp-legend-item is-off">Sin llegar</span>
        {targetRate != null && (
          <span className="gp-legend-item is-target">Objetivo {signed(targetRate)}</span>
        )}
      </div>
    </div>
  );
}

export function GoalProgressModal({ open, onClose }: GoalProgressModalProps) {
  const weightLog = useAppStore((s) => s.weightLog);
  const profile = useAppStore((s) => s.profile);

  const sorted = [...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ema = computeEma(sorted);
  const goal = readGoal(profile, ema);
  // The first bucket is where measuring started, not a week you moved
  // through: its change is computed against its own first reading, so it
  // always lands near zero and would read as a week you stood still.
  const weeks = goalWeeks(ema).slice(1);
  const targetRate = targetWeeklyRate(profile);

  // The last four weeks, not the whole history: an ETA built on a rate
  // you were moving at two months ago answers a question nobody asked.
  const recent = weeks.slice(-4);
  const recentRate =
    recent.length > 0 ? recent.reduce((sum, w) => sum + w.change, 0) / recent.length : null;

  const timeline = goalTimeline(profile, ema, recentRate);

  // Only meaningful when you're actually moving toward the target — a
  // rate pointing the wrong way would produce a confident negative ETA.
  const weeksLeft =
    goal && goal.kind === "directional" && !goal.done && recentRate != null && Math.abs(recentRate) > 0.02
      ? goal.remaining / recentRate
      : null;

  return (
    <Modal open={open} title="Progreso" onClose={onClose}>
      {!goal ? (
        <p className="empty-state">
          Define un peso objetivo en tu perfil para ver el progreso aquí.
        </p>
      ) : (
        <>
          <div className="ss-totals">
            <div className="ss-total">
              <span className="ss-total-value">{goal.current.toFixed(1)}</span>
              <span className="ss-total-label">kg ahora</span>
            </div>
            <div className="ss-total">
              <span className="ss-total-value">
                {goal.kind === "maintain" ? signed(goal.remaining, 1) : Math.abs(goal.remaining).toFixed(1)}
              </span>
              <span className="ss-total-label">
                {goal.kind === "maintain" ? "kg de desvío" : "kg restantes"}
              </span>
            </div>
            <div className="ss-total">
              <span className="ss-total-value">
                {weeksLeft == null || weeksLeft > 260 ? "—" : Math.ceil(weeksLeft)}
              </span>
              <span className="ss-total-label">semanas al ritmo actual</span>
            </div>
          </div>

          {goal.kind === "directional" && timeline && (
            <div className="gp-schedule">
              <div className="gp-sched-row">
                <span className="gp-sched-k">Objetivo</span>
                <span className="gp-sched-v">{formatGoalDate(timeline.plannedDate)}</span>
              </div>
              <div className="gp-sched-row">
                <span className="gp-sched-k">A tu ritmo</span>
                <span className="gp-sched-v">
                  {timeline.projectedDate ? formatGoalDate(timeline.projectedDate) : "—"}
                </span>
              </div>
              {timeline.deltaDays != null && (
                <div
                  className={
                    "gp-verdict" +
                    (timeline.deltaDays > 3 ? " is-behind" : timeline.deltaDays < -3 ? " is-ahead" : " is-on")
                  }
                >
                  {Math.abs(timeline.deltaDays) <= 3
                    ? "En hora"
                    : `${Math.abs(timeline.deltaDays)} días ${timeline.deltaDays > 0 ? "por detrás" : "por delante"}`}
                </div>
              )}
              {timeline.originInferred && (
                <p className="gp-sched-note">
                  Calculado desde tu primer pesaje: este objetivo es anterior a que la app
                  guardara cuándo empezaste.
                </p>
              )}
            </div>
          )}

          {goal.kind === "directional" && (
            <div className="gp-track">
              <div className="gp-track-bar">
                <div className="gp-track-fill" style={{ width: `${Math.round(goal.fraction * 100)}%` }} />
              </div>
              <div className="gp-track-labels">
                <span>{ema.length ? ema[0].ema.toFixed(1) : "—"} kg</span>
                <span className="gp-track-pct">{Math.round(goal.fraction * 100)}%</span>
                <span>{goal.target.toFixed(1)} kg</span>
              </div>
            </div>
          )}
          {goal.kind === "maintain" && (
            <p className="modal-hint">
              {goal.done ? "Dentro" : "Fuera"} del margen de ±{MAINTAIN_BAND_KG} kg.
            </p>
          )}

          <div className="section-head">
            <span className="section-title">Por semana</span>
          </div>
          <WeeklyWaterfall weeks={weeks} targetRate={targetRate} />

          <div className="log-list">
            {[...weeks].reverse().map((w) => (
              <div className="row row--static" key={w.weekStart}>
                <span className="row-name">Semana del {formatShortDate(w.weekStart)}</span>
                <span className="gp-week-cum">{signed(w.cumulative, 1)} kg</span>
                <span className="gp-week-change">{signed(w.change)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
