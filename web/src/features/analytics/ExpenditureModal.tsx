// The expenditure estimate over time, with the numbers on the axes.
//
// The insight card states one figure; this is the series behind it, and
// the intake it's derived from — expenditure here is intake minus what
// the trend weight says you stored, so showing intake alongside it is
// showing the working.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { AxisChart, type ChartPoint } from "../../shared/components/AxisChart";
import { useAppStore } from "../../shared/store";
import { expenditureSeries } from "./expenditure";
import { getAllDays, getRecentDays } from "../../shared/lib/analytics";
import { CHART_RANGES, findRange } from "../../shared/lib/chart";
import { parseDateKey } from "../../shared/lib/date";
import { targetMidpoints } from "./week";

interface ExpenditureModalProps {
  open: boolean;
  onClose: () => void;
}

const DAY = 24 * 60 * 60 * 1000;

// Same windows as every other chart. The *default* is three months
// rather than thirty days because the estimate needs a fortnight of
// logging before it settles — a 30-day default would open on the part of
// the curve that is still finding itself.

export function ExpenditureModal({ open, onClose }: ExpenditureModalProps) {
  const days = useAppStore((s) => s.days);
  const weightLog = useAppStore((s) => s.weightLog);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);
  const [rangeId, setRangeId] = useState("90");

  const range = findRange(rangeId);
  const dayOf = (d: string) => Math.round(parseDateKey(d).getTime() / DAY);

  const exp = expenditureSeries(days, weightLog, range.days);
  const expPoints: ChartPoint[] = exp.map((p) => ({ x: dayOf(p.date), y: p.kcal }));

  // Only days with food, so an unlogged day doesn't draw a dive to zero.
  const intake: ChartPoint[] = (range.days == null ? getAllDays(days, weightLog) : getRecentDays(days, range.days))
    .filter((d) => d.total > 0)
    .map((d) => ({ x: dayOf(d.date), y: d.total }));

  const latest = exp.length ? exp[exp.length - 1].kcal : null;
  const avgIntake = intake.length ? intake.reduce((s, p) => s + p.y, 0) / intake.length : null;
  const target = targetMidpoints(calorieTarget, macroTargets).kcal;

  const fmtX = (v: number) => {
    const d = new Date(v * DAY);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <Modal open={open} title="Gasto energético" onClose={onClose}>
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
          <span className="ss-total-value">{latest == null ? "—" : Math.round(latest)}</span>
          <span className="ss-total-label">kcal gasto</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">{avgIntake == null ? "—" : Math.round(avgIntake)}</span>
          <span className="ss-total-label">kcal ingesta</span>
        </div>
        <div className="ss-total">
          <span className="ss-total-value">
            {latest == null || avgIntake == null ? "—" : Math.round(avgIntake - latest)}
          </span>
          <span className="ss-total-label">diferencia</span>
        </div>
      </div>

      <AxisChart
        series={[
          { id: "intake", label: "Ingesta", points: intake, color: "var(--ink-faint)", faint: true },
          { id: "exp", label: "Gasto estimado", points: expPoints, color: "var(--accent)", endDot: true, area: true }
        ]}
        includeY={target != null ? [target] : []}
        formatY={(v) => String(Math.round(v))}
        formatX={fmtX}
      />

      <p className="modal-hint">
        Ingesta media menos el cambio de tu peso tendencia, a 7700 kcal/kg. Se asienta a las dos
        semanas.
      </p>
    </Modal>
  );
}
