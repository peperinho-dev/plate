// Bottom-sheet modal shell, matching the .modal/.modal-sheet markup in the
// vanilla index.html.
//
// Deliberately a plain conditional render rather than AnimatePresence: the
// vanilla app animates the sheet only on *open* (backdropIn/sheetUp) and
// closes instantly by toggling [hidden]. Mount-time CSS animations still
// fire here, so this is exact parity. Adding an exit transition would be an
// enhancement beyond the port — easy to layer on later if wanted.
import type { ReactNode } from "react";
import { CloseIcon } from "./Icons";

interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="modal"
      // Only a click on the backdrop itself closes — clicks inside the
      // sheet bubble up to here too, same guard the vanilla app used.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="modal-header">
          <span>{title}</span>
          <button className="modal-close" aria-label="Cerrar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
