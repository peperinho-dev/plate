// Export / import, as its own sheet.
//
// The Ajustes index has always offered a "Copia de seguridad" row, but it
// opened the profile sheet — because that's where export and import were
// buried, several fields down, under everything about sex, age and
// targets. A row should deliver what it names.
import { useRef } from "react";
import { Modal } from "../../shared/components/Modal";
import { showToast } from "../../shared/components/Toast";
import { useAppStore } from "../../shared/store";
import { exportData, importData } from "./dataTransfer";

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
}

export function BackupModal({ open, onClose }: BackupModalProps) {
  const lastExportedAt = useAppStore((s) => s.lastExportedAt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Modal open={open} title="Copia de seguridad" onClose={onClose}>
      <p className="modal-hint">
        Solo en este dispositivo: si borras la app, se borran con ella.{" "}
        {lastExportedAt
          ? `Última copia: ${new Date(lastExportedAt).toLocaleDateString("es-ES")}.`
          : "Todavía ninguna."}
      </p>

      <div className="field-row">
        <button type="button" className="btn btn--primary btn--block" onClick={() => void exportData()}>
          Exportar
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => fileInputRef.current?.click()}
        >
          Importar
        </button>
      </div>

      {/* Both facts belong on this screen — it's where someone forms the
          belief about what a backup does and contains — but they're one
          line, not three paragraphs. */}
      <p className="modal-hint">Incluye las fotos. Importar reemplaza todo.</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const ok = importData(String(reader.result));
            showToast(ok ? "Datos importados" : "Archivo no válido");
            if (ok) onClose();
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
