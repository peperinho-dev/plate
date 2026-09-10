// Today at a glance, at the top of Resumen.
//
// Answers "where am I right now" across all three things the app tracks,
// which is what you open it to check. The history below answers the
// different question of "how has it been going", and the period toggle
// belongs to that half only — today is always today.
//
// The calories and macros reuse DayTotals rather than restating it: two
// components drawing the same range bar would drift apart, and this is
// the same number the food log shows, not a second opinion on it.
import { useAppStore } from "../../shared/store";
import { todayKey } from "../../shared/lib/date";
import { computeWorkoutDayTotals, formatDuration } from "../../shared/lib/workouts";
import { latestWeightEntry } from "../../shared/lib/targets";
import { computeEma } from "../profile/adaptive";
import { DayTotals } from "../nutrition/components/DayTotals";

export function TodaySummary() {
  const days = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);

  const key = todayKey(0);
  const entries = days[key]?.entries ?? [];
  const exercises = workouts[key]?.exercises ?? [];
  const timerLogs = workouts[key]?.timerLogs ?? [];
  const totals = computeWorkoutDayTotals(exercises);

  const latest = latestWeightEntry(weightLog);
  const sorted = [...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ema = computeEma(sorted);
  // Compared against a fortnight ago rather than the previous weigh-in:
  // day-to-day weight is mostly water, and a delta that flips sign every
  // morning tells you nothing.
  const trend =
    ema.length >= 2 ? ema[ema.length - 1].ema - ema[Math.max(0, ema.length - 8)].ema : null;

  const workoutLine =
    totals.sets > 0
      ? `${totals.sets} ${totals.sets === 1 ? "serie" : "series"}${
          totals.volume > 0 ? ` · ${Math.round(totals.volume)} kg` : ""
        }`
      : timerLogs.length > 0
        ? `${formatDuration(timerLogs.reduce((sum, l) => sum + l.totalSeconds, 0))} de temporizadores`
        : "Sin entreno todavía";

  return (
    <div className="card card--totals">
      <span className="today-label">Hoy</span>
      <DayTotals entries={entries} dayKey={key} />

      <div className="today-rows">
        <div className="today-row">
          <span className="today-row-label">Entreno</span>
          <span className="today-row-value">{workoutLine}</span>
        </div>
        <div className="today-row">
          <span className="today-row-label">Peso</span>
          <span className="today-row-value">
            {latest ? `${latest.weightKg.toFixed(1)} kg` : "Sin registros"}
            {trend !== null && Math.abs(trend) >= 0.05 && (
              <span className="today-row-trend">
                {" "}
                {trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
