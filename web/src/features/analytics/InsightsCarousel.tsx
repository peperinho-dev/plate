// Quick-glance summary cards above the full charts — ported from
// renderInsightsCarousel() in app.js. Deliberately a small card + sparkline
// rather than a second copy of the detailed charts' axes and labels.
import { useAppStore } from "../../shared/store";
import { smoothPath, type Point } from "../../shared/lib/svgPath";
import { hasWorkoutSession } from "../../shared/lib/nutrition";
import type { DayStat } from "../../shared/lib/analytics";
import type { EmaPoint } from "../profile/adaptive";

const SPARK_W = 100;
const SPARK_H = 32;

function MiniLineSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} />;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(maxV - minV, 0.0001);
  const pts: Point[] = values.map((v, i) => ({
    x: (i / (values.length - 1)) * SPARK_W,
    y: 4 + (SPARK_H - 8) - ((v - minV) / range) * (SPARK_H - 8)
  }));
  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} preserveAspectRatio="none">
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniBarSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} />;
  const maxV = Math.max(...values, 1);
  const gap = 2;
  const barW = SPARK_W / values.length - gap;
  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} preserveAspectRatio="none">
      {values.map((v, i) => {
        const barH = Math.max(2, (v / maxV) * (SPARK_H - 4));
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={SPARK_H - barH}
            width={barW}
            height={barH}
            rx={1.5}
            fill="var(--accent)"
          />
        );
      })}
    </svg>
  );
}

interface InsightsCarouselProps {
  periodDays: DayStat[];
  weightWithEma: EmaPoint[];
}

export function InsightsCarousel({ periodDays, weightWithEma }: InsightsCarouselProps) {
  const workouts = useAppStore((s) => s.workouts);
  const calorieTarget = useAppStore((s) => s.calorieTarget);

  const cards: React.ReactNode[] = [];

  if (weightWithEma.length >= 2) {
    const last = weightWithEma[weightWithEma.length - 1].raw;
    // Uses the same EMA-smoothed delta as the Weight chart's stat line
    // below, rather than raw first/last — otherwise the two "weight change"
    // figures on this screen can disagree.
    const diff = weightWithEma[weightWithEma.length - 1].ema - weightWithEma[0].ema;
    cards.push(
      <div className="insight-card" key="weight">
        <span className="insight-card-label">Peso</span>
        <span className="insight-card-value">{last.toFixed(1)} kg</span>
        <span className="insight-card-sub">
          {diff > 0 ? "+" : ""}
          {diff.toFixed(1)} kg (tendencia)
        </span>
        <span className="insight-card-spark">
          <MiniLineSparkline values={weightWithEma.map((p) => p.raw)} />
        </span>
      </div>
    );
  }

  const loggedDays = periodDays.filter((d) => d.total > 0);
  if (loggedDays.length >= 2) {
    const avgKcal = loggedDays.reduce((sum, d) => sum + d.total, 0) / loggedDays.length;
    const { min, max } = calorieTarget;
    const targetMid = min && max ? (min + max) / 2 : null;
    // Averages only days that were actually logged (skips 0-kcal gaps), so
    // it's spelled out here — otherwise it silently disagrees with the bar
    // chart below, which shows every day including unlogged ones.
    const sub = targetMid
      ? `${loggedDays.length}/${periodDays.length} días · objetivo ${Math.round(targetMid)}`
      : `media de ${loggedDays.length} días registrados`;
    cards.push(
      <div className="insight-card" key="calories">
        <span className="insight-card-label">Calorías</span>
        <span className="insight-card-value">{Math.round(avgKcal)} kcal</span>
        <span className="insight-card-sub">{sub}</span>
        <span className="insight-card-spark">
          <MiniLineSparkline values={periodDays.map((d) => d.total)} />
        </span>
      </div>
    );
  }

  if (periodDays.length >= 2) {
    const totalSessions = periodDays.filter((d) => hasWorkoutSession(workouts, d.date)).length;
    cards.push(
      <div className="insight-card" key="workouts">
        <span className="insight-card-label">Entrenos</span>
        <span className="insight-card-value">{totalSessions}</span>
        <span className="insight-card-sub">sesiones en el periodo</span>
        <span className="insight-card-spark">
          <MiniBarSparkline
            values={periodDays.map((d) => (hasWorkoutSession(workouts, d.date) ? 1 : 0))}
          />
        </span>
      </div>
    );
  }

  if (cards.length === 0) return null;
  return <div className="insights-carousel">{cards}</div>;
}
