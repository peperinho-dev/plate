// Barcode scanner sheet. The camera is started when the modal opens and
// always torn down on close — leaving the track running would keep the
// phone's camera indicator lit after the sheet is gone.
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { startScan, type ScanControls } from "../../../shared/lib/scanner";

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

export function ScanModal({ open, onClose, onDetected }: ScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScanControls | null>(null);
  const [hint, setHint] = useState("Apunta al código de barras del producto.");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  // Held in a ref so the camera effect below depends only on `open`.
  // Depending on the callback itself would restart the camera on every
  // parent render — and since a failed getUserMedia sets state, that turns
  // into a render loop.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHint("Apunta al código de barras del producto.");

    (async () => {
      try {
        const controls = await startScan({
          video: videoRef.current!,
          onResult: (barcode) => {
            // Stop immediately so the same code isn't reported repeatedly
            // while the sheet animates away.
            controlsRef.current?.stop();
            onDetectedRef.current(barcode);
          }
        });
        // The modal may have closed while getUserMedia was still pending;
        // if so, shut the camera down rather than leaking the track.
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setHint(
          name === "NotAllowedError"
            ? "Sin permiso de cámara. Introduce el código a mano."
            : "No se pudo abrir la cámara. Introduce el código a mano."
        );
        setManualOpen(true);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  return (
    <Modal open={open} title="Escanear código de barras" onClose={onClose}>
      <div className="scanner-viewport">
        <video ref={videoRef} playsInline muted />
        <div className="scanner-frame" aria-hidden="true" />
      </div>
      <p className="scanner-hint">{hint}</p>
      <button type="button" className="link-btn" onClick={() => setManualOpen((v) => !v)}>
        Introducir código a mano
      </button>
      {manualOpen && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const code = manualCode.trim();
            if (code) onDetectedRef.current(code);
          }}
        >
          <label className="field">
            <span>Código de barras</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="p. ej. 8410000123456"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn--primary btn--block">
            Buscar
          </button>
        </form>
      )}
    </Modal>
  );
}
