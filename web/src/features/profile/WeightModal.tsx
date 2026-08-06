// Weight log — its own modal reached from ProfileModal's "Registro de
// peso →" button, matching vanilla. Folding a bare weight input into the
// profile sheet (as an earlier pass did) lost the history/delete list and
// bulked out the sheet for no reason.
import { useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { SwipeToDelete } from "../../shared/components/SwipeToDelete";
import { showToast } from "../../shared/components/Toast";
import { ChevronLeft, XIcon } from "../../shared/components/Icons";
import { useAppStore } from "../../shared/store";
import { todayKey } from "../../shared/lib/date";
import { logWeight, removeWeightEntry } from "./actions";

interface WeightModalProps {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
}

export function WeightModal({ open, onClose, onBack }: WeightModalProps) {
  const weightLog = useAppStore((s) => s.weightLog);
  const [date, setDate] = useState(todayKey(0));
  const [weight, setWeight] = useState("");

  const sorted = [...weightLog].sort((a, b) => (a.date < b.date ? 1 : -1));

  const title = (
    <button type="button" className="modal-back" onClick={onBack} aria-label="Volver al perfil">
      <ChevronLeft size={13} /> Perfil
    </button>
  );

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="modal-hint" style={{ marginTop: -4 }}>
        Registro de peso
      </p>

      {sorted.length > 0 ? (
        <div className="log-list">
          {sorted.map((w) => (
            <SwipeToDelete
              key={w.date}
              onDelete={() => {
                removeWeightEntry(w.date);
                showToast("Registro eliminado");
              }}
            >
              <div className="row">
                <div className="row-main">
                  <span className="row-name">{w.weightKg.toFixed(1)} kg</span>
                  <span className="row-qty">{w.date}</span>
                </div>
                <button
                  className="row-del"
                  aria-label="Quitar"
                  onClick={() => removeWeightEntry(w.date)}
                >
                  <XIcon />
                </button>
              </div>
            </SwipeToDelete>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>Sin registros todavía.</p>
        </div>
      )}

      <form
        className="form form--divided"
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          const w = parseFloat(weight);
          if (!(w > 0)) return;
          logWeight(w, date);
          setWeight("");
          showToast("Peso guardado");
        }}
      >
        <div className="field-row">
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Peso (kg)</span>
            <input
              type="number"
              min="20"
              max="300"
              step="0.1"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={!weight}>
          Añadir peso
        </button>
      </form>
    </Modal>
  );
}
