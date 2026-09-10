// "Pegar en…" — the destination picker that opens right after Copiar.
// Ported from the pasteTargetModal in the vanilla app, which replaced the
// old flow of navigating to a day first and only then pasting.
import { Modal } from "../../../shared/components/Modal";
import { useUiStore } from "../../../shared/store/ui";
import { todayKey } from "../../../shared/lib/date";
import { showToast } from "../../../shared/components/Toast";
import { pasteEntriesToDay, removeEntries, type PasteTimeMode } from "../actions";

export function PasteTargetSheet() {
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const clipboard = useUiStore((s) => s.clipboard);
  const setClipboard = useUiStore((s) => s.setClipboard);

  const paste = (dayKey: string, timeMode: PasteTimeMode, message: string) => {
    // This sheet is only ever reached from the food log, so a workout on
    // the clipboard isn't something it can paste.
    if (clipboard?.type !== "nutrition") return;
    pasteEntriesToDay(clipboard.entries, dayKey, timeMode);
    // A move is a paste that also takes the originals away, and only once
    // they have safely landed — never the other way round, so a failure
    // can't lose the entries.
    //
    // The originals go even when the destination is the same day. The
    // paste writes fresh ids, so removing the old ones is safe, and
    // "Ahora" on the current day is a legitimate move — it re-times the
    // entries to now. Skipping the removal there duplicated them instead.
    if (clipboard.intent === "move") {
      removeEntries(clipboard.sourceDayKey, clipboard.entries.map((e) => e.id));
    }
    setClipboard(null);
    closeModal();
    showToast(clipboard.intent === "move" ? message.replace("Pegado", "Movido") : message);
  };

  return (
    <Modal
      open={activeModal === "paste"}
      title={clipboard?.type === "nutrition" && clipboard.intent === "move" ? "Mover a…" : "Pegar en…"}
      onClose={closeModal}
    >
      <div className="paste-target-list">
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => paste(todayKey(0), "now", "Pegado ahora")}
        >
          Ahora
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => paste(todayKey(0), "keep", "Pegado en hoy")}
        >
          Hoy
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => paste(todayKey(1), "keep", "Pegado en mañana")}
        >
          Mañana
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={() => openCalendar("paste")}>
          Elegir día…
        </button>
      </div>
    </Modal>
  );
}
