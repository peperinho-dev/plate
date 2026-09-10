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
import { readGoal, goalWeeks, targetWeeklyRate, MAINTAIN_BAND_KG, type GoalWeek } from "./goal";
import { formatShortDate } from "../../shared/lib/format";

interface GoalProgressModalProps {
  open: boolean;
  onClose: () => void;
}

const CHART_H = 96;

/** Signed kg, always with its sign, because the direction is the point. */
function signed(kg: number, digits = 2): string {
  return `${kg > 0 ? "+" : kg < 0 ? "−" : ""}${Math.abs(kg).toFixed(digits)}`;
}

/**
 * One bar per week, hanging off a zero line rather than growing from the
 * floor: a week is a signed change, and a bar chart that puts a −0.2 kg
 * week and a +0.2 kg week at the same height would hide the only thing
 * worth seeing.
 */
function WeeklyWaterfall({ weeks, targetRate }: { weeks: GoalWeek[]; targetRate: number | null }) {
  if (weeks.length === 0) return null;
  // The y range covers the bars, the zero line and the target line, then
  // lets zero sit wherever it falls inside that. Centring zero instead
  // would be symmetrical and wrong: a cut only ever produces negative
  // weeks, so half the chart was empty and every bar was squashed into
  // the other half.
  const values = [...weeks.map((w) => w.change), 0];
  if (targetRate != null) values.push(targetRate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 0.1;
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => CHART_H - ((v - lo) / (hi - lo)) * CHART_H;
  const zeroY = y(0);
  const slot = 100 / weeks.length;
  const barW = Math.min(slot * 0.6, 7);
  // Anything within a tenth of the aim counts as hitting it; a bar that
  // lands 40 g short is not a week you did anything wrong.
  const onTarget = (change: number) =>
    targetRate == null ? true : Math.sign(change) === Math.sign(targetRate) && Math.abs(change) >= Math.abs(targetRate) - 0.1;

  return (
    <div className="gp-chart-wrap">
      <svg
        className="gp-chart"
        viewBox={`0 0 100 ${CHART_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cambio de peso por semana"
      >
        {targetRate != null && (
          <line x1="0" y1={y(targetRate)} x2="100" y2={y(targetRate)} className="gp-ref" />
        )}
        {weeks.map((w, i) => {
          const top = Math.min(zeroY, y(w.change));
          const h = Math.abs(y(w.change) - zeroY);
          return (
            <rect
              key={w.weekStart}
              x={i * slot + (slot - barW) / 2}
              y={top}
              width={barW}
              height={Math.max(h, 1)}
              className={"gp-bar" + (onTarget(w.change) ? " is-on" : " is-off")}
            />
          );
        })}
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} className="gp-zero" />
      </svg>
      <div className="trend-legend">
        {targetRate != null && (
          <span className="gp-legend-item is-target">Objetivo {signed(targetRate)} kg/sem</span>
        )}
        <span className="gp-legend-item is-on">En objetivo</span>
        <span className="trend-legend-days">{weeks.length} semanas</span>
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
              Objetivo {goal.target.toFixed(1)} kg, margen ±{MAINTAIN_BAND_KG} kg.{" "}
              {goal.done ? "Dentro del margen." : "Fuera del margen."}
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
