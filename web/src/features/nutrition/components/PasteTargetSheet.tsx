// "Pegar en…" — the destination picker that opens right after Copiar.
// Ported from the pasteTargetModal in the vanilla app, which replaced the
// old flow of navigating to a day first and only then pasting.
import { Modal } from "../../../shared/components/Modal";
import { useUiStore } from "../../../shared/store/ui";
import { todayKey } from "../../../shared/lib/date";
import { showToast } from "../../../shared/components/Toast";
import { pasteEntriesToDay, type PasteTimeMode } from "../actions";

export function PasteTargetSheet() {
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const openCalendar = useUiStore((s) => s.openCalendar);
  const clipboard = useUiStore((s) => s.clipboard);

  const paste = (dayKey: string, timeMode: PasteTimeMode, message: string) => {
    // This sheet is only ever reached from the food log, so a workout on
    // the clipboard isn't something it can paste.
    if (clipboard?.type !== "nutrition") return;
    pasteEntriesToDay(clipboard.entries, dayKey, timeMode);
    closeModal();
    showToast(message);
  };

  return (
    <Modal open={activeModal === "paste"} title="Pegar en…" onClose={closeModal}>
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
