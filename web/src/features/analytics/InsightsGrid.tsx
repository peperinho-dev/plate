// "Insights & Analytics" — the interpreted layer of the dashboard.
//
// MacroFactor's three are Expenditure, Weight Trend and Goal Progress:
// not raw logs but readings of them. Goal Progress is the one adaptation
// — theirs charts progress toward a goal weight, which this app never
// asks for. What it does ask for is a rate, so the third card compares
// the rate you're actually moving at against the one you chose.
import { useAppStore } from "../../shared/store";
import { smoothPath, type Point } from "../../shared/lib/svgPath";
import { expenditureSeries, trendRatePerWeek } from "./expenditure";
import type { EmaPoint } from "../profile/adaptive";

const SPARK_W = 100;
const SPARK_H = 32;

function Sparkline({ values }: { values: number[] }) {
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
      <path d={smoothPath(pts)} fill="none" stroke="var(--accent)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface InsightsGridProps {
  weightWithEma: EmaPoint[];
}

export function InsightsGrid({ weightWithEma }: InsightsGridProps) {
  const days = useAppStore((s) => s.days);
  const weightLog = useAppStore((s) => s.weightLog);
  const profile = useAppStore((s) => s.profile);

  const cards: React.ReactNode[] = [];

  const expenditure = expenditureSeries(days, weightLog);
  if (expenditure.length >= 2) {
    const latest = expenditure[expenditure.length - 1].kcal;
    cards.push(
      <div className="insight-card" key="expenditure">
        <span className="insight-card-label">Gasto energético</span>
        <span className="insight-card-value">{Math.round(latest)} kcal</span>
        <span className="insight-card-sub">estimado, 14 días</span>
        <span className="insight-card-spark">
          <Sparkline values={expenditure.map((p) => p.kcal)} />
        </span>
      </div>
    );
  }

  if (weightWithEma.length >= 2) {
    const last = weightWithEma[weightWithEma.length - 1];
    const diff = last.ema - weightWithEma[0].ema;
    cards.push(
      <div className="insight-card" key="weight">
        <span className="insight-card-label">Tendencia de peso</span>
        <span className="insight-card-value">{last.ema.toFixed(1)} kg</span>
        <span className="insight-card-sub">
          {diff > 0 ? "+" : ""}
          {diff.toFixed(1)} kg en el periodo
        </span>
        <span className="insight-card-spark">
          <Sparkline values={weightWithEma.map((p) => p.raw)} />
        </span>
      </div>
    );
  }

  const actualRate = trendRatePerWeek(weightWithEma);
  const goalRate = profile.rateKgPerWeek;
  if (actualRate != null) {
    // A goal of losing is a negative rate; the profile stores the
    // magnitude and the direction separately, so they're recombined here
    // before comparing signs.
    const signedGoal =
      goalRate == null || profile.goalType == null || profile.goalType === "maintain"
        ? null
        : profile.goalType === "lose"
          ? -Math.abs(goalRate)
          : Math.abs(goalRate);
    cards.push(
      <div className="insight-card" key="rate">
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

  if (cards.length === 0) return null;
  return <div className="insights-grid">{cards}</div>;
}
