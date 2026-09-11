// "Insights & Analytics" — the interpreted layer of the dashboard.
//
// MacroFactor's three are Expenditure, Weight Trend and Goal Progress:
// not raw logs but readings of them. Goal Progress is the one adaptation
// — theirs charts progress toward a goal weight, which this app never
// asks for. What it does ask for is a rate, so the third card compares
// the rate you're actually moving at against the one you chose.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { WeightTrendModal } from "./WeightTrendModal";
import { ExpenditureModal } from "./ExpenditureModal";
import { TrainingDetailModal } from "./TrainingDetailModal";
import { GoalProgressModal } from "./GoalProgressModal";
import { ExerciseTrendModal } from "./ExerciseTrendModal";
import { trainingSeries } from "./trainingSeries";
import { getRecentDays } from "../../shared/lib/analytics";
import { smoothPath, type Point } from "../../shared/lib/svgPath";
import { expenditureSeries, trendRatePerWeek } from "./expenditure";
import { readGoal, MAINTAIN_BAND_KG } from "./goal";
import { computeEma } from "../profile/adaptive";
import type { EmaPoint } from "../profile/adaptive";

const SPARK_W = 100;
const SPARK_H = 32;

/**
 * A trend line with the area under it filled.
 *
 * The fill is the single change that most closes the gap with the
 * reference app: a bare 2px stroke reads as a wire laid over the card,
 * while a filled one reads as a quantity with weight. Every chart in this
 * app was a bare stroke — 38 of them, none filled.
 *
 * `currentColor` throughout, so the tile sets the domain hue once on
 * itself and the line, the fill and the endpoint all follow.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} />;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(maxV - minV, 0.0001);
  const pts: Point[] = values.map((v, i) => ({
    x: (i / (values.length - 1)) * SPARK_W,
    y: 4 + (SPARK_H - 8) - ((v - minV) / range) * (SPARK_H - 8)
  }));
  const line = smoothPath(pts);
  // The same curve, closed down to the baseline. Reusing the line's own
  // path data keeps the fill's top edge exactly on the stroke — building
  // a second curve would let the two drift apart by a subpixel.
  const area = `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`;
  const last = pts[pts.length - 1];
  // Where the last point sits as a share of the chart's height, measured
  // from the bottom. The dot is placed with CSS off this rather than drawn
  // in the SVG: at x = SPARK_W it sat exactly on the svg's edge and was
  // clipped, and preserveAspectRatio="none" stretched it into an ellipse.
  const endPct = ((SPARK_H - last.y) / SPARK_H) * 100;
  return (
    <span className="spark-wrap">
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} preserveAspectRatio="none">
        <path className="spark-area" d={area} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="spark-end" style={{ bottom: `${endPct}%` }} />
    </span>
  );
}

/**
 * Training is a series of discrete events, not a continuous trend: on most
 * of the last 30 days there is simply no session. Drawn as a line — which
 * is what this card used to do — every rest day plunged to the floor and
 * every session spiked back, producing a seismograph that read as noise
 * next to the two genuinely continuous sparklines beside it.
 *
 * Bars encode absence as absence. A rest day is a baseline tick rather
 * than a data point at zero, so the shape you read is the rhythm of
 * training against rest.
 */
function MiniBars({ values }: { values: number[] }) {
  if (values.length === 0) return <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} />;
  const maxV = Math.max(...values, 1);
  const slot = SPARK_W / values.length;
  // Narrower than the slot by a good margin. At 0.62 the bars nearly
  // touched, and thirty of them read as a solid wall rather than as the
  // rhythm of training against rest, which is the only thing this chart
  // exists to show.
  const barW = Math.max(slot * 0.42, 0.8);
  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width="100%" height={SPARK_H} preserveAspectRatio="none">
      {values.map((v, i) => {
        // Trained days get at least 3px so a single-set day still reads as
        // a session; rest days get a 2px tick, present but clearly empty.
        const h = v > 0 ? Math.max((v / maxV) * (SPARK_H - 4), 3) : 2;
        return (
          <rect
            key={i}
            className={"mini-bar" + (v > 0 ? "" : " is-rest")}
            x={i * slot + (slot - barW) / 2}
            y={SPARK_H - h}
            width={barW}
            height={h}
          />
        );
      })}
    </svg>
  );
}

interface InsightsGridProps {
  weightWithEma: EmaPoint[];
}

export function InsightsGrid({ weightWithEma }: InsightsGridProps) {
  // The cards state a figure; tapping one opens the series behind it, with
  // numbers on both axes. Goal has no detail of its own yet — its story is
  // the weight trend, so it opens that.
  const [detail, setDetail] = useState<"weight" | "expenditure" | "training" | "goal" | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const days = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);
  const profile = useAppStore((s) => s.profile);

  const cards: React.ReactNode[] = [];

  // Thirty days, like every other tile here. The caption used to say
  // "14 días" while the series actually ran sixty: 14 is the rolling
  // window each point is computed over, not the range on screen.
  const expenditure = expenditureSeries(days, weightLog, 30);
  if (expenditure.length >= 2) {
    const latest = expenditure[expenditure.length - 1].kcal;
    cards.push(
      <button type="button" className="insight-card is-tappable is-energy" key="expenditure"
              onClick={() => setDetail("expenditure")}>
        <span className="insight-card-label">Gasto energético</span>
        <span className="insight-card-value">{Math.round(latest)} kcal</span>
        <span className="insight-card-sub">estimado · 30 días</span>
        <span className="insight-card-spark">
          <Sparkline values={expenditure.map((p) => p.kcal)} />
        </span>
      </button>
    );
  }

  if (weightWithEma.length >= 2) {
    const last = weightWithEma[weightWithEma.length - 1];
    const diff = last.ema - weightWithEma[0].ema;
    cards.push(
      <button type="button" className="insight-card is-tappable is-body" key="weight"
              onClick={() => setDetail("weight")}>
        <span className="insight-card-label">Tendencia de peso</span>
        <span className="insight-card-value">{last.ema.toFixed(1)} kg</span>
        <span className="insight-card-sub">
          {diff > 0 ? "+" : ""}
          {diff.toFixed(1)} kg en 30 días
        </span>
        <span className="insight-card-spark">
          <Sparkline values={weightWithEma.map((p) => p.raw)} />
        </span>
      </button>
    );
  }

  // Goal Progress when there's a destination to progress toward, and the
  // rate on its own when there isn't — a rate goal is complete without a
  // target weight, so the card degrades rather than disappearing.
  //
  // Deliberately reads the whole weight history rather than the period
  // the rest of this screen is filtered to. Progress toward a goal is not
  // a property of the last seven days, and letting the period toggle
  // change it made the same goal read 1% or 60% depending on a control
  // that has nothing to do with it.
  const fullEma = computeEma([...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1)));
  const goal = readGoal(profile, fullEma);
  const actualRate = trendRatePerWeek(weightWithEma);

  if (goal) {
    const pct = Math.round(goal.fraction * 100);
    cards.push(
      <button type="button" className="insight-card is-tappable is-body" key="goal"
              onClick={() => setDetail("goal")}>
        <span className="insight-card-label">Progreso</span>
        <span className="insight-card-value">
          {goal.kind === "maintain"
            ? `${goal.remaining > 0 ? "+" : ""}${goal.remaining.toFixed(1)} kg`
            : goal.done
              ? "Conseguido"
              : `${Math.abs(goal.remaining).toFixed(1)} kg`}
        </span>
        <span className="insight-card-sub">
          {goal.kind === "maintain"
            ? goal.done
              ? `dentro de ±${MAINTAIN_BAND_KG} kg`
              : `fuera del margen · meta ${goal.target.toFixed(1)} kg`
            : goal.done
              ? `meta ${goal.target.toFixed(1)} kg`
              : `para ${goal.target.toFixed(1)} kg · ${pct}%`}
        </span>
        {goal.kind === "directional" && (
          <span className="goal-meter">
            <span className="goal-meter-fill" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
    );
  } else if (actualRate != null) {
    const signedGoal =
      profile.rateKgPerWeek == null || profile.goalType == null || profile.goalType === "maintain"
        ? null
        : profile.goalType === "lose"
          ? -Math.abs(profile.rateKgPerWeek)
          : Math.abs(profile.rateKgPerWeek);
    cards.push(
      <div className="insight-card is-body" key="rate">
        <span className="insight-card-label">Ritmo</span>
        <span className="insight-card-value">
          {actualRate > 0 ? "+" : ""}
          {actualRate.toFixed(2)} kg/sem
        </span>
        <span className="insight-card-sub">
          {signedGoal == null
            ? "sin objetivo de ritmo"
            : `objetivo ${signedGoal > 0 ? "+" : ""}${signedGoal.toFixed(2)}`}
        </span>
      </div>
    );
  }

  // A fourth card, so the grid reads as a grid rather than three and a
  // hole. Their nutrition dashboard has three because workouts live in a
  // separate app with their own; this one is blended, so training belongs
  // in the same set.
  const trainKeys = getRecentDays(days, 30).map((d) => d.date);
  const trainSeries = trainingSeries(workouts, trainKeys, "sets", weightLog);
  const sessions = trainSeries.filter((p) => p.trained);
  if (sessions.length > 0) {
    const totalSets = sessions.reduce((sum, p) => sum + p.value, 0);
    cards.push(
      <button type="button" className="insight-card is-tappable is-training" key="training"
              onClick={() => setDetail("training")}>
        <span className="insight-card-label">Entreno</span>
        <span className="insight-card-value">{sessions.length} sesiones</span>
        <span className="insight-card-sub">{Math.round(totalSets)} series · 30 días</span>
        <span className="insight-card-spark">
          <MiniBars values={trainSeries.map((p) => p.value)} />
        </span>
      </button>
    );
  }

  if (cards.length === 0) return null;
  return (
    <>
      <div className="insights-grid">{cards}</div>
      <WeightTrendModal open={detail === "weight"} onClose={() => setDetail(null)} />
      <GoalProgressModal open={detail === "goal"} onClose={() => setDetail(null)} />
      <ExpenditureModal open={detail === "expenditure"} onClose={() => setDetail(null)} />
      <TrainingDetailModal
        open={detail === "training"}
        onClose={() => setDetail(null)}
        onPickExercise={(name) => setExercise(name)}
      />
      <ExerciseTrendModal open={exercise !== null} name={exercise} onClose={() => setExercise(null)} />
    </>
  );
}
