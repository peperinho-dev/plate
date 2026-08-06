// The Análisis tab. Cards are reorderable and hideable, persisted in
// analyticsLayout — the vanilla version did this with up/down arrows;
// here it's a real drag, which is what dnd-kit was added for.
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAppStore } from "../../shared/store";
import { todayKey } from "../../shared/lib/date";
import { formatDuration, formatSet } from "../../shared/lib/workouts";
import { computeEma } from "../profile/adaptive";
import { collectProgressionGroups } from "./progressions";
import { LineChart } from "./LineChart";
import { InsightsCarousel } from "./InsightsCarousel";
import {
  computeExerciseRecords,
  computeTopContributors,
  countSessionsInPeriod,
  getAllDays,
  getRecentDays
} from "../../shared/lib/analytics";
import { dayCalorieTotal, hasWorkoutSession } from "../../shared/lib/nutrition";
import { SortableCard } from "./SortableCard";
import { setAnalyticsLayout } from "./actions";

const ALL_CARDS = [
  "streak",
  "records",
  "calories",
  "weight",
  "macros",
  "progressions",
  "contributors",
  "workouts"
] as const;
type CardId = (typeof ALL_CARDS)[number];

const CARD_TITLES: Record<CardId, string> = {
  streak: "Constancia",
  records: "Récords recientes",
  calories: "Calorías",
  weight: "Peso",
  macros: "Macros",
  progressions: "Progresiones",
  contributors: "Más consumido",
  workouts: "Entrenamientos"
};

export function AnalyticsView() {
  const days = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const layout = useAppStore((s) => s.analyticsLayout);

  const [period, setPeriod] = useState<number | "all">(7);
  const [editing, setEditing] = useState(false);
  const [recordsMode, setRecordsMode] = useState<"reps" | "hold">("reps");

  // Touch needs a small activation distance, or a scroll gesture that
  // starts on the handle would be swallowed as a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const periodDays = period === "all" ? getAllDays(days, weightLog) : getRecentDays(days, period);
  const dateKeys = new Set(periodDays.map((d) => d.date));

  // Computed once and shared by the insights card, the stat line and the
  // chart itself, so all three agree on the same sorted/smoothed data
  // instead of each re-deriving it slightly differently.
  const periodEma = computeEma(
    weightLog.filter((w) => dateKeys.has(w.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  );

  // Cards not present in the stored layout are appended, so a card added
  // in a later version shows up instead of silently disappearing.
  const order: { id: CardId; hidden: boolean }[] = (() => {
    const stored = (layout ?? []).filter((l) => (ALL_CARDS as readonly string[]).includes(l.id)) as {
      id: CardId;
      hidden: boolean;
    }[];
    const known = new Set(stored.map((s) => s.id));
    return [...stored, ...ALL_CARDS.filter((id) => !known.has(id)).map((id) => ({ id, hidden: false }))];
  })();

  const visible = editing ? order : order.filter((o) => !o.hidden);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((o) => o.id === active.id);
    const to = order.findIndex((o) => o.id === over.id);
    if (from < 0 || to < 0) return;
    setAnalyticsLayout(arrayMove(order, from, to));
  };

  const toggleHidden = (id: CardId) =>
    setAnalyticsLayout(order.map((o) => (o.id === id ? { ...o, hidden: !o.hidden } : o)));

  const renderCard = (id: CardId) => {
    switch (id) {
      case "streak": {
        // Fixed 30-day window regardless of the period toggle — the point
        // is the pattern at a glance, not a slice of it.
        const keys = Array.from({ length: 30 }, (_, i) => todayKey(-(29 - i)));
        return (
          <>
            <div className="streak-block">
              <span className="streak-label">Nutrición</span>
              <div className="streak-grid">
                {keys.map((k) => (
                  <span key={k} className={"streak-cell" + (dayCalorieTotal(days, k) > 0 ? " is-nutrition" : "")} />
                ))}
              </div>
            </div>
            <div className="streak-block">
              <span className="streak-label">Entreno</span>
              <div className="streak-grid">
                {keys.map((k) => (
                  <span key={k} className={"streak-cell" + (hasWorkoutSession(workouts, k) ? " is-workout" : "")} />
                ))}
              </div>
            </div>
            <p className="stat-note">Últimos 30 días</p>
          </>
        );
      }

      case "records": {
        const records = computeExerciseRecords(workouts, dateKeys, recordsMode);
        const max = records[0]?.value ?? 1;
        return (
          <>
            <div className="segmented segmented--compact">
              <button
                type="button"
                className={"segmented-btn" + (recordsMode === "reps" ? " active" : "")}
                onClick={() => setRecordsMode("reps")}
              >
                Reps
              </button>
              <button
                type="button"
                className={"segmented-btn" + (recordsMode === "hold" ? " active" : "")}
                onClick={() => setRecordsMode("hold")}
              >
                Tiempo
              </button>
            </div>
            {records.length === 0 ? (
              <p className="empty-state">Sin series de este tipo en este periodo.</p>
            ) : (
              <div className="record-list">
                {records.map((r) => (
                  <div className="record-row" key={r.name}>
                    <span className="record-name">{r.name}</span>
                    <div className="record-bar-track">
                      <div
                        className="record-bar-fill"
                        style={{ width: `${Math.max(6, Math.round((r.value / max) * 100))}%` }}
                      />
                    </div>
                    <span className="record-value">
                      {recordsMode === "hold" ? formatDuration(r.value) : `${r.value} reps`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }

      case "calories": {
        const logged = periodDays.filter((d) => d.total > 0);
        const avg = logged.length ? logged.reduce((s, d) => s + d.total, 0) / logged.length : 0;
        const peak = Math.max(calorieTarget.max, ...periodDays.map((d) => d.total), 1) * 1.08;
        return (
          <>
            <div className="totals-row">
              <span className="totals-label">Media</span>
              <span className="totals-value">{Math.round(avg)} kcal</span>
            </div>
            <p className="stat-note">
              {logged.length}/{periodDays.length} días registrados
            </p>
            <div className="calorie-bars" aria-hidden="true">
              {periodDays.map((d) => {
                const inRange = d.total >= calorieTarget.min && d.total <= calorieTarget.max;
                return (
                  <span
                    key={d.date}
                    className={"calorie-bar" + (d.total === 0 ? " is-empty" : inRange ? " is-in-range" : "")}
                    style={{ height: `${Math.max(2, (d.total / peak) * 100)}%` }}
                  />
                );
              })}
            </div>
          </>
        );
      }

      case "weight": {
        // Shares periodEma with the insights card above — daily weight is
        // too noisy to read raw, so the trend line is the point.
        const ema = periodEma;
        if (ema.length < 2) return <p className="empty-state">Registra tu peso para ver la tendencia.</p>;
        const diff = ema[ema.length - 1].ema - ema[0].ema;
        // The average of the raw weigh-ins, not the latest one — the
        // insights card above already carries "latest", so repeating it
        // here would waste the line. Matches app.js's weightStatLine.
        const avg = ema.reduce((sum, e) => sum + e.raw, 0) / ema.length;
        return (
          <>
            <p className="stat-note">
              Media: {avg.toFixed(1)} kg · Diferencia: {diff > 0 ? "+" : ""}
              {diff.toFixed(1)} kg
            </p>
            <LineChart
              series={[
                { label: "Real", color: "var(--ink-faint)", values: ema.map((e) => e.raw), dots: true },
                {
                  label: "Tendencia",
                  color: "var(--accent)",
                  values: ema.map((e) => e.ema),
                  smooth: true,
                  area: true
                }
              ]}
              dates={ema.map((e) => e.date)}
              formatTick={(v) => v.toFixed(1)}
              minRange={0.5}
            />
          </>
        );
      }

      case "macros": {
        const hasData = periodDays.some((d) => d.protein || d.fat || d.carbs);
        if (!hasData) return <p className="empty-state">Registra comidas con macros para ver la tendencia.</p>;
        // Unlogged days are null rather than 0 so the line breaks instead
        // of dropping to the floor on days you simply didn't log.
        const val = (pick: (d: (typeof periodDays)[number]) => number) =>
          periodDays.map((d) => (d.total > 0 ? pick(d) : null));
        return (
          <LineChart
            series={[
              { label: "Prot.", color: "var(--accent)", values: val((d) => d.protein), smooth: true },
              { label: "Grasa", color: "var(--macro-fat)", values: val((d) => d.fat), smooth: true },
              { label: "Carbos", color: "var(--macro-carbs)", values: val((d) => d.carbs), smooth: true }
            ]}
            dates={periodDays.map((d) => d.date)}
            baseline="zero"
            maxScale={1.1}
          />
        );
      }

      case "progressions": {
        const groups = collectProgressionGroups(workouts);
        if (groups.size === 0) {
          return (
            <p className="empty-state">
              Etiqueta variantes de un mismo ejercicio con un grupo de progresión para verlas aquí.
            </p>
          );
        }
        return (
          <div className="log-list">
            {Array.from(groups.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([groupName, variants]) => (
                <div className="row" key={groupName}>
                  <div className="row-main">
                    <span className="row-name">{groupName}</span>
                    <span className="row-qty">
                      {variants.length} variante{variants.length === 1 ? "" : "s"} · actual:{" "}
                      {variants[variants.length - 1].name}
                    </span>
                  </div>
                  <span className="row-amount">
                    {variants[variants.length - 1].bestSet
                      ? formatSet(variants[variants.length - 1].bestSet!)
                      : "—"}
                  </span>
                </div>
              ))}
          </div>
        );
      }

      case "contributors": {
        const contributors = computeTopContributors(days, dateKeys);
        if (contributors.length === 0) return <p className="empty-state">Sin datos en este periodo.</p>;
        return (
          <div className="log-list">
            {contributors.map((c) => (
              <div className="row" key={c.name}>
                <div className="row-main">
                  <span className="row-name">{c.name}</span>
                </div>
                <span className="row-amount">{Math.round(c.total)} kcal</span>
              </div>
            ))}
          </div>
        );
      }

      case "workouts": {
        const sessions = countSessionsInPeriod(workouts, dateKeys);
        const weeks = periodDays.length / 7;
        return (
          <>
            <div className="totals-row">
              <span className="totals-label">Sesiones</span>
              <span className="totals-value">{sessions}</span>
            </div>
            <p className="stat-note">
              {weeks >= 1 ? `${(sessions / weeks).toFixed(1)} por semana de media` : "—"}
            </p>
          </>
        );
      }
    }
  };

  return (
    <div className="view">
      <header className="topbar">
        <span className="day-label">Análisis</span>
        <div className="topbar-actions">
          <div className="segmented segmented--compact">
            {([7, 30, "all"] as const).map((p) => (
              <button
                key={String(p)}
                type="button"
                className={"segmented-btn" + (period === p ? " active" : "")}
                onClick={() => setPeriod(p)}
              >
                {p === "all" ? "Todo" : `${p} d`}
              </button>
            ))}
          </div>
          <button type="button" className="link-btn" onClick={() => setEditing((v) => !v)}>
            {editing ? "Listo" : "Editar"}
          </button>
        </div>
      </header>

      <main className="content">
        <InsightsCarousel periodDays={periodDays} weightWithEma={periodEma} />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((v) => v.id)} strategy={verticalListSortingStrategy}>
            {visible.map((card) => (
              <SortableCard
                key={card.id}
                id={card.id}
                title={CARD_TITLES[card.id]}
                editing={editing}
                hidden={card.hidden}
                onToggleHidden={() => toggleHidden(card.id)}
              >
                {renderCard(card.id)}
              </SortableCard>
            ))}
          </SortableContext>
        </DndContext>
      </main>
    </div>
  );
}
