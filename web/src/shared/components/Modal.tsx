// Bottom-sheet modal shell, matching the .modal/.modal-sheet markup in the
// vanilla index.html.
//
// The vanilla app only animated on *open* (backdropIn/sheetUp) and closed
// instantly by toggling [hidden]. AnimatePresence adds the matching exit —
// React unmounts immediately otherwise, so a CSS close transition would
// never get a chance to play.
//
// Motion drives enter *and* exit here, so the stylesheet's own mount
// animations are suppressed (animation: none) to avoid the two fighting
// over the same first frame.
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloseIcon } from "./Icons";

interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

// Mirrors the timing/curve of the sheetUp + backdropIn keyframes.
const SHEET_EASE = [0.2, 0.8, 0.2, 1] as const;

export function Modal({ open, title, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal"
          style={{ animation: "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          // Only a click on the backdrop itself closes — clicks inside the
          // sheet bubble up to here too, same guard the vanilla app used.
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="modal-sheet"
            style={{ animation: "none" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: SHEET_EASE }}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="modal-header">
              <span>{title}</span>
              <button className="modal-close" aria-label="Cerrar" onClick={onClose}>
                <CloseIcon />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
