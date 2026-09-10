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
        Tus datos viven solo en este dispositivo. Si borras la app de la pantalla de inicio, se
        borran con ella — exporta de vez en cuando.
        {lastExportedAt
          ? ` Última copia: ${new Date(lastExportedAt).toLocaleDateString("es-ES")}.`
          : " Todavía no has hecho ninguna."}
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

      <p className="modal-hint">
        Importar reemplaza todo lo que hay ahora. Exporta antes si no estás seguro.
      </p>
      {/* Said here as well as in the photos sheet: this is the screen
          where someone forms the belief about what a backup contains. */}
      <p className="modal-hint">
        Incluye las fotos de progreso, así que el archivo puede pesar bastante más si tienes
        muchas.
      </p>

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
