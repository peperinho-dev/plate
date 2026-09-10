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
import { formatEyebrowDate } from "../../shared/lib/format";
import { formatDuration } from "../../shared/lib/workouts";
import { computeEma } from "../profile/adaptive";
import { InsightsGrid } from "./InsightsGrid";
import { WidgetDeck } from "./widgets/WidgetDeck";
import { NutritionTargetsWidget } from "./widgets/NutritionTargetsWidget";
import { EnergyBalanceWidget } from "./widgets/EnergyBalanceWidget";
import { DailyNutritionWidget } from "./widgets/DailyNutritionWidget";
import { WeeklyWorkoutsWidget } from "./widgets/WeeklyWorkoutsWidget";
import {
  computeExerciseRecords,
  getAllDays,
  getRecentDays
} from "../../shared/lib/analytics";
import { dayCalorieTotal, hasWorkoutSession } from "../../shared/lib/nutrition";
import { SortableCard } from "./SortableCard";
import { setAnalyticsLayout } from "./actions";

// Default order matches the card order in app.js's index.html — a stored
// analyticsLayout overrides it, but the out-of-the-box screen should look
// the same in both.
// Trimmed to the widgets MacroFactor actually has. Calories, weight and
// macros moved up into the widget deck; contributors and progressions had
// no counterpart there and were cut rather than kept for their own sake.
const ALL_CARDS = ["records", "streak"] as const;
type CardId = (typeof ALL_CARDS)[number];

const CARD_TITLES: Record<CardId, string> = {
  records: "Récords recientes",
  streak: "Constancia"
};

export function AnalyticsView() {
  const days = useAppStore((s) => s.days);
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);
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

    }
  };

  return (
    <div className="view">
      {/* Date eyebrow over the title, rather than the title alone: this
          is the screen you open to ask "how is it going", and the answer
          is only meaningful against a date. */}
      <header className="topbar topbar--stacked">
        <span className="topbar-heading">
          <span className="topbar-eyebrow">{formatEyebrowDate()}</span>
          <span className="day-label">Resumen</span>
        </span>
        <button type="button" className="link-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? "Listo" : "Editar"}
        </button>
      </header>

      <main className="content">
        {/* The deck mirrors MacroFactor's: the week, the last month
            against expenditure, today, and — since this app is one app
            rather than two — the training week alongside them. */}
        <WidgetDeck>
          <NutritionTargetsWidget />
          <EnergyBalanceWidget />
          <DailyNutritionWidget />
          <WeeklyWorkoutsWidget />
        </WidgetDeck>

        <div className="section-head">
          <span className="section-title">Análisis</span>
        </div>
        <InsightsGrid weightWithEma={periodEma} />

        {/* The period toggle belongs to the history below, not to the
            screen, so it sits on that section's header where what it
            changes is visible. */}
        <div className="section-head">
          <span className="section-title">Historial</span>
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
        </div>

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
