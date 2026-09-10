// What the central + offers. One add affordance for the whole app, so
// "log something" is the same gesture wherever you are, rather than a
// different button per tab — and Análisis, which had no way to add
// anything at all, gets one.
import { Modal } from "../shared/components/Modal";
import { DumbbellIcon, ScanIcon, TargetIcon, CameraIcon } from "../shared/components/Icons";
import { useUiStore, type QuickAction } from "../shared/store/ui";

const ACTIONS: { id: QuickAction; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "food", label: "Comida", hint: "Buscar y registrar", icon: <TargetIcon size={19} /> },
  { id: "scan", label: "Escanear", hint: "Código de barras", icon: <ScanIcon size={19} /> },
  { id: "exercise", label: "Ejercicio", hint: "Añadir a la sesión", icon: <DumbbellIcon size={19} /> },
  { id: "weight", label: "Peso", hint: "Registrar peso", icon: null },
  // Taking a progress photo is a logging action like any other. It was
  // only reachable through Ajustes, which is where you review them, not
  // where you'd think to add one — the same split weight already has.
  { id: "photo", label: "Foto", hint: "Foto de progreso", icon: <CameraIcon size={19} /> }
];

export function QuickActionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const requestAction = useUiStore((s) => s.requestAction);

  return (
    <Modal open={open} title="Añadir" onClose={onClose}>
      <div className="log-list">
        {ACTIONS.map((a) => (
          <div className="row" key={a.id}>
            <button
              type="button"
              className="row-main"
              onClick={() => {
                onClose();
                requestAction(a.id);
              }}
            >
              <span className="row-name">{a.label}</span>
              <span className="row-qty">{a.hint}</span>
            </button>
            {a.icon && <span className="row-amount quick-action-icon">{a.icon}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
