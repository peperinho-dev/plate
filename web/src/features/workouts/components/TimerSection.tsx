// Warmup / stretch timers: named countdown presets that log a session
// when they finish.
//
// Kept separate from exercises because a warmup isn't a set — but it
// should still register as having shown up, which is what timerLogs is
// for.
import { useRef, useState } from "react";
import { useAppStore } from "../../../shared/store";
import { showToast } from "../../../shared/components/Toast";
import { XIcon } from "../../../shared/components/Icons";
import { formatDuration } from "../../../shared/lib/workouts";
import { useRestTimer } from "../useRestTimer";
import { logTimerSession, removeTimerPreset, saveTimerPreset } from "../actions";

interface TimerSectionProps {
  category: "warmup" | "stretch";
  label: string;
  dayKey: string;
}

export function TimerSection({ category, label, dayKey }: TimerSectionProps) {
  // The selector must return a stable reference: filtering inside it
  // would build a new array on every call, so the store's snapshot would
  // never compare equal and React would re-render forever.
  const allTimers = useAppStore((s) => s.timers);
  const timers = allTimers.filter((t) => t.category === category);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [runningName, setRunningName] = useState<string | null>(null);

  // A ref, not a local: the completion callback fires long after the
  // render that started the timer, so a plain variable would be back to
  // null by then.
  const runningSecondsRef = useRef<number | null>(null);

  const timer = useRestTimer(() => {
    // Only logged on natural completion — skipping shouldn't count.
    if (runningSecondsRef.current !== null) {
      logTimerSession(dayKey, category, runningSecondsRef.current);
    }
    showToast(`${label} completado`);
    setRunningName(null);
  });

  const start = (presetName: string, seconds: number) => {
    runningSecondsRef.current = seconds;
    setRunningName(presetName);
    timer.start(seconds);
  };

  return (
    <div className="quick-section">
      <div className="quick-label-row">
        <div className="quick-label">{label}</div>
        <div className="quick-label-actions">
          <button type="button" className="link-btn" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancelar" : "+ Nuevo"}
          </button>
          {timers.length > 0 && (
            <button type="button" className="link-btn link-btn--muted" onClick={() => setEditing((v) => !v)}>
              {editing ? "Listo" : "Editar"}
            </button>
          )}
        </div>
      </div>

      {timer.isRunning && (
        <div className="rest-timer">
          <div className="rest-timer-info">
            <span className="rest-timer-label">{runningName}</span>
            <span className="rest-timer-time">{formatDuration(timer.remaining ?? 0)}</span>
          </div>
          <div className="rest-timer-actions">
            <button
              type="button"
              className="rest-timer-skip"
              onClick={() => {
                timer.stop();
                setRunningName(null);
              }}
            >
              Saltar
            </button>
          </div>
        </div>
      )}

      {timers.length > 0 && (
        <div className="quick-row">
          {timers.map((t) => (
            <button
              key={t.id}
              type="button"
              className="quick-chip"
              onClick={() => (editing ? removeTimerPreset(t.id) : start(t.name, t.seconds))}
            >
              <span className="quick-chip-name">{t.name}</span>
              <span className="quick-chip-kcal">{formatDuration(t.seconds)}</span>
              {editing && (
                <span className="quick-chip-del" aria-label="Quitar">
                  <XIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <form
          className="form"
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const mins = parseFloat(minutes);
            if (!name.trim() || !(mins > 0)) return;
            saveTimerPreset(name.trim(), category, Math.round(mins * 60));
            setName("");
            setMinutes("5");
            setAdding(false);
          }}
        >
          <div className="field-row">
            <label className="field">
              <span>Nombre</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Minutos</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" className="btn btn--secondary btn--block" disabled={!name.trim()}>
            Guardar
          </button>
        </form>
      )}
    </div>
  );
}
