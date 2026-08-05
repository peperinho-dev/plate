// The Nutrición tab. Structure mirrors the #nutritionView markup in the
// vanilla index.html so the ported stylesheet applies unchanged.
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { formatDateLabel, capitalizeFirst } from "../../shared/lib/format";
import { WeekStrip } from "../../shared/components/WeekStrip";
import { ChevronLeft, ChevronRight, GearIcon, ScanIcon, TargetIcon } from "../../shared/components/Icons";
import { EntryList } from "./components/EntryList";
import { DayTotals } from "./components/DayTotals";

export function NutritionView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const days = useAppStore((s) => s.days);

  const dayKey = todayKey(dayOffset);
  const entries = days[dayKey]?.entries ?? [];
  const label = formatDateLabel(dayOffset);

  // Previous day is offered as a one-tap starting point on an empty day.
  const prevEntries = days[todayKey(dayOffset - 1)]?.entries ?? [];

  return (
    <div className="view">
      <header className="topbar">
        <div className="day-nav">
          <button className="icon-btn" aria-label="Día anterior" onClick={() => shiftDay(-1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="day-label">
            {label.short}
          </button>
          <button className="icon-btn" aria-label="Día siguiente" onClick={() => shiftDay(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" aria-label="Perfil">
            <GearIcon />
          </button>
          <button className="chip">
            {calorieTarget.min}–{calorieTarget.max} kcal
          </button>
        </div>
      </header>

      <WeekStrip />

      <main className="content">
        <div className="card">
          <div className="card-date-row">
            <div className="card-date">
              {capitalizeFirst(`${label.weekday}, ${label.day} de ${label.month}`)}
            </div>
            <div className="card-date-actions">
              {entries.length > 0 && (
                <button type="button" className="link-btn link-btn--muted">
                  Copiar
                </button>
              )}
              {entries.length > 0 && (
                <button type="button" className="link-btn">
                  Seleccionar
                </button>
              )}
            </div>
          </div>

          {entries.length > 0 ? (
            <EntryList entries={entries} dayKey={dayKey} />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <TargetIcon size={34} strokeWidth={1.6} />
              </div>
              <p>
                Sin artículos todavía.
                <br />
                Escanea o añade el primero.
              </p>
              {prevEntries.length > 0 && (
                <button type="button" className="link-btn">
                  Copiar de ayer
                </button>
              )}
            </div>
          )}

          <DayTotals entries={entries} />
        </div>
      </main>

      <div className="action-bar">
        <button className="btn btn--primary btn--block">
          <span className="btn-icon">
            <ScanIcon />
          </span>{" "}
          Escanear
        </button>
        <button className="btn btn--secondary btn--block">
          <span className="btn-icon">+</span> Añadir a mano
        </button>
      </div>
    </div>
  );
}
