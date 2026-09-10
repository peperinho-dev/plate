// "Resumen nutricional" — the Nutrition Overview, reached by tapping the
// day's totals.
//
// Follows the reference app's structure: a period selector across the
// top, then nutrients grouped into sections, each row reading
// label · value / target · percent with a bar beneath it. Contributors
// are behind a switch, because the top-3-per-nutrient breakdown is
// genuinely useful and genuinely noisy, and which one it is depends on
// what you opened this for.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { ChevronDown } from "../../../shared/components/Icons";
import { NutrientTrend } from "./NutrientTrend";
import { useAppStore } from "../../../shared/store";
import {
  OVERVIEW_PERIODS,
  readOverview,
  type NutrientId,
  type PeriodId,
  type OverviewReading
} from "../overview";

interface NutritionOverviewModalProps {
  open: boolean;
  dayKey: string;
  onClose: () => void;
}

interface RowSpec {
  id: NutrientId;
  label: string;
  unit: string;
  target: number | null;
  kind: string;
}

function NutrientRow({
  spec,
  reading,
  showContributors,
  dayKey,
  periodDays,
  expanded,
  onToggle
}: {
  spec: RowSpec;
  reading: OverviewReading;
  showContributors: boolean;
  dayKey: string;
  periodDays: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const n = reading.nutrients[spec.id];
  const pct = spec.target && spec.target > 0 ? Math.round((n.value / spec.target) * 100) : null;
  const width = spec.target && spec.target > 0 ? Math.min(100, (n.value / spec.target) * 100) : 0;
  const round = (v: number) => (spec.unit === "kcal" || spec.unit === "mg" ? Math.round(v) : Math.round(v * 10) / 10);

  return (
    <div className={"nut-row" + (expanded ? " is-expanded" : "")}>
      {/* The whole head opens the trend — the row is the control, so the
          chevron is an affordance rather than the only target. */}
      <button type="button" className="nut-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="nut-label">{spec.label}</span>
        <span className="nut-value">
          {round(n.value)}
          {spec.target != null && <span className="nut-target"> / {Math.round(spec.target)}</span>} {spec.unit}
        </span>
        <span className="nut-pct">{pct == null ? "—" : `${pct} %`}</span>
        <span className={"nut-chevron" + (expanded ? " is-expanded" : "")}>
          <ChevronDown />
        </span>
      </button>
      <span className="nut-track">
        <span className={"nut-fill is-" + spec.kind} style={{ width: `${width}%` }} />
      </span>

      {expanded && (
        <NutrientTrend
          nutrient={spec.id}
          dayKey={dayKey}
          periodDays={periodDays}
          target={spec.target}
          unit={spec.unit}
          kind={spec.kind}
        />
      )}

      {showContributors && n.contributors.length > 0 && (
        <div className="nut-contributors">
          <span className="nut-contributors-label">Principales</span>
          {n.contributors.map((c) => (
            <div className="nut-contributor" key={c.name}>
              <span className="nut-contributor-name">{c.name}</span>
              <span className="nut-contributor-amount">
                {round(c.amount)} {spec.unit}
              </span>
              <span className="nut-contributor-share">{Math.round(c.share)} %</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NutritionOverviewModal({ open, dayKey, onClose }: NutritionOverviewModalProps) {
  const days = useAppStore((s) => s.days);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const macroTargets = useAppStore((s) => s.macroTargets);

  const [period, setPeriod] = useState<PeriodId>("day");
  const [contributors, setContributors] = useState(false);
  // One open at a time: the trends are tall, and two of them push the
  // third off the screen you opened this to read.
  const [openNutrient, setOpenNutrient] = useState<NutrientId | null>(null);

  const spec = OVERVIEW_PERIODS.find((p) => p.id === period) ?? OVERVIEW_PERIODS[0];
  const reading = readOverview(days, dayKey, spec.days);

  const calorieRows: RowSpec[] = [
    { id: "calories", label: "Calorías", unit: "kcal", target: calorieTarget.max, kind: "kcal" }
  ];
  const macroRows: RowSpec[] = [
    { id: "protein", label: "Proteína", unit: "g", target: macroTargets.proteinMax, kind: "protein" },
    { id: "fat", label: "Grasa", unit: "g", target: macroTargets.fatMax, kind: "fat" },
    { id: "carbs", label: "Carbos", unit: "g", target: macroTargets.carbsMax, kind: "carbs" }
  ];
  // No targets are stored for these, so they report intake without a
  // denominator rather than inventing one.
  const otherRows: RowSpec[] = [
    { id: "fiber", label: "Fibra", unit: "g", target: null, kind: "other" },
    { id: "sugar", label: "Azúcar", unit: "g", target: null, kind: "other" },
    { id: "sodium", label: "Sodio", unit: "mg", target: null, kind: "other" }
  ];

  return (
    <Modal open={open} title="Resumen nutricional" onClose={onClose}>
      <div className="period-tabs" role="tablist">
        {OVERVIEW_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === period}
            className={"period-tab" + (p.id === period ? " is-active" : "")}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="overview-note">
        {reading.averaged
          ? reading.loggedDays === 0
            ? "Sin días registrados en este periodo"
            : `Media diaria · ${reading.loggedDays} ${reading.loggedDays === 1 ? "día registrado" : "días registrados"}`
          : "Total del día"}
      </p>

      <div className="nut-section">
        <div className="nut-section-head">
          <span className="nut-section-title">Calorías</span>
          <label className="nut-switch">
            <span>Principales</span>
            <input
              type="checkbox"
              checked={contributors}
              onChange={(e) => setContributors(e.target.checked)}
            />
          </label>
        </div>
        {calorieRows.map((r) => (
          <NutrientRow
            key={r.id}
            spec={r}
            reading={reading}
            showContributors={contributors}
            dayKey={dayKey}
            periodDays={spec.days}
            expanded={openNutrient === r.id}
            onToggle={() => setOpenNutrient(openNutrient === r.id ? null : r.id)}
          />
        ))}
      </div>

      <div className="nut-section">
        <div className="nut-section-head">
          <span className="nut-section-title">Macros</span>
        </div>
        {macroRows.map((r) => (
          <NutrientRow
            key={r.id}
            spec={r}
            reading={reading}
            showContributors={contributors}
            dayKey={dayKey}
            periodDays={spec.days}
            expanded={openNutrient === r.id}
            onToggle={() => setOpenNutrient(openNutrient === r.id ? null : r.id)}
          />
        ))}
      </div>

      <div className="nut-section">
        <div className="nut-section-head">
          <span className="nut-section-title">Otros nutrientes</span>
        </div>
        {otherRows.map((r) => (
          <NutrientRow
            key={r.id}
            spec={r}
            reading={reading}
            showContributors={contributors}
            dayKey={dayKey}
            periodDays={spec.days}
            expanded={openNutrient === r.id}
            onToggle={() => setOpenNutrient(openNutrient === r.id ? null : r.id)}
          />
        ))}
      </div>
    </Modal>
  );
}
