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
import { formatRelativeDay } from "../../shared/lib/format";
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
      <div className="section-head">
        <span className="section-title">Registro de peso</span>
      </div>

      {sorted.length > 0 ? (
        <div className="card">
          <div className="log-list">
            {sorted.map((w, i) => {
              // Against the previous weigh-in, not against yesterday: the
              // gap between entries is whatever it is, and the useful
              // comparison is "since last time I stood on the scale".
              const prev = sorted[i + 1];
              const delta = prev ? w.weightKg - prev.weightKg : null;
              return (
                <SwipeToDelete
                  key={w.date}
                  onDelete={() => {
                    removeWeightEntry(w.date);
                    showToast("Registro eliminado");
                  }}
                >
                  <div className="row weigh-row">
                    <span className="weigh-kg">{w.weightKg.toFixed(1)}<span className="weigh-unit">kg</span></span>
                    <span className="weigh-date">{formatRelativeDay(w.date)}</span>
                    <span
                      className={
                        "weigh-delta" +
                        (delta == null ? " is-none" : delta > 0 ? " is-up" : delta < 0 ? " is-down" : "")
                      }
                    >
                      {delta == null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}`}
                    </span>
                    <button
                      className="row-del"
                      aria-label="Quitar"
                      onClick={() => removeWeightEntry(w.date)}
                    >
                      <XIcon />
                    </button>
                  </div>
                </SwipeToDelete>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>Sin registros todavía.</p>
        </div>
      )}

      <form
        className="form form--divided"
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
