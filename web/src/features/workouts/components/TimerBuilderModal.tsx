// Builds a named sequence of intervals — ported from #timerBuilderModal.
//
// A timer is a list of steps, not one countdown: "Cuello 30s, Hombros 45s,
// Cadera 60s" is one mobility routine you start once and follow through.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { XIcon } from "../../../shared/components/Icons";
import { formatDuration } from "../../../shared/lib/workouts";
import type { TimerCategory, TimerInterval } from "../../../shared/store/types";
import { saveTimerPreset } from "../actions";

interface TimerBuilderModalProps {
  open: boolean;
  category: TimerCategory;
  onClose: () => void;
}

export function TimerBuilderModal({ open, category, onClose }: TimerBuilderModalProps) {
  const [name, setName] = useState("");
  const [intervals, setIntervals] = useState<TimerInterval[]>([]);
  const [ivName, setIvName] = useState("");
  const [ivSeconds, setIvSeconds] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setIntervals([]);
      setIvName("");
      setIvSeconds("");
    }
  }

  const addInterval = () => {
    const secs = parseInt(ivSeconds, 10);
    if (!(secs > 0)) {
      showToast("Indica una duración");
      return;
    }
    setIntervals((prev) => [...prev, { name: ivName.trim() || `Intervalo ${prev.length + 1}`, seconds: secs }]);
    setIvName("");
    setIvSeconds("");
  };

  const save = () => {
    if (!name.trim()) {
      showToast("Indica el nombre del temporizador");
      return;
    }
    if (intervals.length === 0) {
      showToast("Añade al menos un intervalo");
      return;
    }
    saveTimerPreset(name.trim(), category, intervals);
    showToast("Temporizador guardado");
    onClose();
  };

  return (
    <Modal open={open} title="Nuevo temporizador" onClose={onClose}>
      <label className="field">
        <span>Nombre</span>
        <input
          type="text"
          placeholder="p. ej. Piernas"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <span className="field-group-label">Intervalos</span>
      {intervals.length > 0 ? (
        <div className="log-list">
          {intervals.map((iv, i) => (
            <div className="row" key={`${iv.name}-${i}`}>
              <div className="row-main">
                <span className="row-name">{iv.name}</span>
                <span className="row-qty">{formatDuration(iv.seconds)}</span>
              </div>
              <button
                className="row-del"
                aria-label="Quitar"
                onClick={() => setIntervals((prev) => prev.filter((_, j) => j !== i))}
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state empty-state--inline">Añade al menos un intervalo.</p>
      )}

      <div className="form">
        <div className="field-row">
          <label className="field">
            <span>Nombre del intervalo</span>
            <input
              type="text"
              placeholder="p. ej. Saltos"
              value={ivName}
              onChange={(e) => setIvName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Duración (s)</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="30"
              value={ivSeconds}
              onChange={(e) => setIvSeconds(e.target.value)}
            />
          </label>
        </div>
        <button type="button" className="btn btn--secondary btn--block" onClick={addInterval}>
          + Añadir intervalo
        </button>
        <button type="button" className="btn btn--primary btn--block" onClick={save}>
          Guardar temporizador
        </button>
      </div>
    </Modal>
  );
}
