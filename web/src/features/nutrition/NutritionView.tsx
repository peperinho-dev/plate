// The Nutrición tab. Structure mirrors the #nutritionView markup in the
// vanilla index.html so the ported stylesheet applies unchanged.
import { useState } from "react";
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
import { EntryModal } from "./components/EntryModal";
import { ScanModal } from "./components/ScanModal";
import { ProfileModal } from "../profile/ProfileModal";
import { addEntry, pasteEntriesToDay, rememberScannedProduct, updateEntry } from "./actions";
import { showToast } from "../../shared/components/Toast";
import { lookupBarcode } from "../../shared/lib/foodLookup";
import type { Entry } from "../../shared/store/types";
import { deriveEntry, emptyEntryForm, formFromEntry, formFromLookup, type EntryFormState } from "./entryForm";

export function NutritionView() {
  const dayOffset = useUiStore((s) => s.dayOffset);
  const shiftDay = useUiStore((s) => s.shiftDay);
  const openModal = useUiStore((s) => s.openModal);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const setClipboard = useUiStore((s) => s.setClipboard);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedEntryIds = useUiStore((s) => s.selectedEntryIds);
  const setSelectionMode = useUiStore((s) => s.setSelectionMode);
  const selectEntries = useUiStore((s) => s.selectEntries);
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

  // --- Add / scan flow -------------------------------------------------
  const [entryOpen, setEntryOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [form, setForm] = useState<EntryFormState>(emptyEntryForm);
  // Barcode the current form came from, so confirming it can teach the
  // local cache. Null for a purely manual entry.
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  // Set when the form is editing an already-logged entry rather than
  // creating one; also reveals the Hora field.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const patchForm = (patch: Partial<EntryFormState>) => setForm((f) => ({ ...f, ...patch }));

  const openManualAdd = () => {
    setForm(emptyEntryForm());
    setPendingBarcode(null);
    setEditingEntryId(null);
    setEntryOpen(true);
  };

  const openEntryForEdit = (entry: Entry) => {
    setForm(formFromEntry(entry));
    setPendingBarcode(null);
    setEditingEntryId(entry.id);
    setEntryOpen(true);
  };

  const handleDetected = async (barcode: string) => {
    setScanOpen(false);
    setPendingBarcode(barcode);
    showToast(`Buscando ${barcode}…`);
    const result = await lookupBarcode(useAppStore.getState(), barcode);
    if (result) {
      setForm(formFromLookup(result));
      showToast(result.source === "cache" ? "Producto guardado en este dispositivo" : "Producto encontrado");
    } else {
      // Nothing known anywhere — the user fills it in once, and the cache
      // makes every future scan of this barcode instant.
      setForm({ ...emptyEntryForm(), name: "" });
      showToast("No encontrado. Añádelo y lo recordaré.");
    }
    setEntryOpen(true);
  };

  const handleEntrySubmit = () => {
    const derived = deriveEntry(form);
    if (!derived) return;

    const nutrition = {
      name: derived.name,
      calories: derived.calories,
      qtyLabel: derived.qtyLabel,
      protein: derived.protein,
      fat: derived.fat,
      carbs: derived.carbs,
      fiber: derived.fiber,
      sugar: derived.sugar,
      sodium: derived.sodium
    };

    if (editingEntryId) {
      // Keep the entry on its original day, only moving its time-of-day to
      // whatever the Hora field says.
      const existing = entries.find((e) => e.id === editingEntryId);
      let addedAt = existing?.addedAt ?? Date.now();
      const [h, m] = form.time.split(":").map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const d = new Date(addedAt);
        d.setHours(h, m, 0, 0);
        addedAt = d.getTime();
      }
      updateEntry(dayKey, editingEntryId, { ...nutrition, addedAt });
      showToast("Guardado");
    } else {
      addEntry(dayKey, { ...nutrition, addedAt: Date.now() });
      if (pendingBarcode) rememberScannedProduct(pendingBarcode, form);
      showToast("Añadido");
    }

    setEntryOpen(false);
    setPendingBarcode(null);
    setEditingEntryId(null);
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
          <button className="icon-btn" aria-label="Perfil" onClick={() => setProfileOpen(true)}>
            <GearIcon />
          </button>
          {/* The chip is also a shortcut into the same sheet — it's the
              thing you tap when the range itself looks wrong. */}
          <button className="chip" onClick={() => setProfileOpen(true)}>
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
            {/*
              Long-press is the only way into multi-select, so the header
              carries no controls by default — they appear only once a
              selection is under way. "Todo" is what keeps whole-day copy
              reachable without a permanently visible Copiar button.
            */}
            <div className="card-date-actions">
              {selectionMode && (
                <>
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    onClick={() => selectEntries(entries.map((e) => e.id))}
                  >
                    Todo
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleCopy}
                    disabled={selectedCount === 0}
                  >
                    Copiar{selectedCount > 0 ? ` (${selectedCount})` : ""}
                  </button>
                  <button type="button" className="link-btn link-btn--muted" onClick={() => setSelectionMode(false)}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {entries.length > 0 ? (
            <>
              <EntryList entries={entries} dayKey={dayKey} onEdit={openEntryForEdit} />
              {/*
                Multi-select has no visible control any more, so the gesture
                needs teaching. Shown only when there's actually more than
                one thing to select, and never while already selecting.
              */}
              {entries.length > 1 && !selectionMode && (
                <p className="stat-note" style={{ textAlign: "center" }}>
                  Mantén pulsado para seleccionar varios · desliza para quitar
                </p>
              )}
            </>
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

          <DayTotals entries={entries} dayKey={dayKey} />
        </div>
      </main>

      <div className="action-bar">
        <button className="btn btn--primary btn--block" onClick={() => setScanOpen(true)}>
          <span className="btn-icon">
            <ScanIcon />
          </span>{" "}
          Escanear
        </button>
        <button className="btn btn--secondary btn--block" onClick={openManualAdd}>
          <span className="btn-icon">+</span> Añadir a mano
        </button>
      </div>

      <PasteTargetSheet />
      <CalendarModal />
      <EntryModal
        open={entryOpen}
        title={editingEntryId ? "Editar alimento" : pendingBarcode ? "Confirmar producto" : "Añadir alimento"}
        form={form}
        isEditing={!!editingEntryId}
        onChange={patchForm}
        onClose={() => setEntryOpen(false)}
        onSubmit={handleEntrySubmit}
        onScanClick={() => {
          setEntryOpen(false);
          setScanOpen(true);
        }}
      />
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleDetected} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
