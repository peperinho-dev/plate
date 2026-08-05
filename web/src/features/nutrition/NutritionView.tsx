// The Nutrición tab. Structure mirrors the #nutritionView markup in the
// vanilla index.html so the ported stylesheet applies unchanged.
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { todayKey } from "../../shared/lib/date";
import { formatDateLabel, capitalizeFirst } from "../../shared/lib/format";
import { WeekStrip } from "../../shared/components/WeekStrip";
import { CalendarModal } from "../../shared/components/CalendarModal";
import { ChevronLeft, ChevronRight, GearIcon, ScanIcon, TargetIcon } from "../../shared/components/Icons";
import { EntryList } from "./components/EntryList";
import { DayTotals } from "./components/DayTotals";
import { PasteTargetSheet } from "./components/PasteTargetSheet";
import { pasteEntriesToDay } from "./actions";
import { showToast } from "../../shared/components/Toast";

export function NutritionView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const activeModal = useUiStore((s) => s.activeModal);
  const openModal = useUiStore((s) => s.openModal);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const setClipboard = useUiStore((s) => s.setClipboard);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedEntryIds = useUiStore((s) => s.selectedEntryIds);
  const setSelectionMode = useUiStore((s) => s.setSelectionMode);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const days = useAppStore((s) => s.days);

  const dayKey = todayKey(dayOffset);
  const entries = days[dayKey]?.entries ?? [];
  const label = formatDateLabel(dayOffset);

  // Previous day is offered as a one-tap starting point on an empty day.
  const prevEntries = days[todayKey(dayOffset - 1)]?.entries ?? [];

  // Copiar scopes to the checked entries whenever a selection is active —
  // otherwise it copies the whole day. (The vanilla version originally
  // always copied the day, which read as a bug once anything was ticked.)
  const selectedCount = selectedEntryIds.size;
  const handleCopy = () => {
    const source = selectionMode && selectedCount > 0
      ? entries.filter((e) => selectedEntryIds.has(e.id))
      : entries;
    if (source.length === 0) return;
    setClipboard({ type: "nutrition", entries: source.map((e) => ({ ...e })) });
    if (selectionMode) setSelectionMode(false);
    openModal("paste");
  };

  const handleCopyYesterday = () => {
    pasteEntriesToDay(prevEntries, dayKey, "keep");
    showToast("Copiado de ayer");
  };

  return (
    <div className="view">
      <header className="topbar">
        <div className="day-nav">
          <button className="icon-btn" aria-label="Día anterior" onClick={() => shiftDay(-1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="day-label" onClick={() => openCalendar("navigate")}>
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
                <button type="button" className="link-btn link-btn--muted" onClick={handleCopy}>
                  {selectedCount > 0 ? `Copiar (${selectedCount})` : "Copiar"}
                </button>
              )}
              {entries.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setSelectionMode(!selectionMode)}>
                  {selectionMode ? "Cancelar" : "Seleccionar"}
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
                <button type="button" className="link-btn" onClick={handleCopyYesterday}>
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

      <PasteTargetSheet />
      {activeModal === "calendar" && <CalendarModal />}
    </div>
  );
}
