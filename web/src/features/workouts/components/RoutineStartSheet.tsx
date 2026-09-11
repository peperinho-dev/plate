// Confirming a routine before it starts.
//
// Tapping a routine used to add its exercises straight away, which made
// "which routine?" and "start it" the same gesture and left rest to be
// decided set by set, on a countdown that had already begun. Rest is a
// property of the session — you decide once that today is 90s and then
// stop thinking about it — so it is chosen here, alongside a look at what
// you are about to do.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { useAppStore } from "../../../shared/store";
import { formatDuration, REST_CHOICES } from "../../../shared/lib/workouts";
import type { Routine } from "../../../shared/store/types";

interface RoutineStartSheetProps {
  routine: Routine | null;
  onClose: () => void;
  onStart: (restSeconds: number) => void;
}

export function RoutineStartSheet({ routine, onClose, onStart }: RoutineStartSheetProps) {
  const defaultRest = useAppStore((s) => s.workoutGoal.restSeconds) || 90;
  const [rest, setRest] = useState<number | null>(null);

  // Re-reads the default each time a different routine is opened, so the
  // sheet never shows a choice left over from the last one.
  const [lastId, setLastId] = useState(routine?.id ?? null);
  if ((routine?.id ?? null) !== lastId) {
    setLastId(routine?.id ?? null);
    setRest(null);
  }

  if (!routine) return null;
  const chosen = rest ?? defaultRest;

  return (
    <Modal open title={routine.name} onClose={onClose}>
      <div className="section-head">
        <span className="section-title">
          {routine.exerciseNames.length}{" "}
          {routine.exerciseNames.length === 1 ? "ejercicio" : "ejercicios"}
        </span>
      </div>
      <div className="card">
        <div className="log-list">
          {routine.exerciseNames.map((name, i) => (
            <div className="row row--static" key={`${name}-${i}`}>
              <span className="row-name">{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Descanso entre series</span>
        <div className="segmented segmented--compact">
          {REST_CHOICES.map((secs) => (
            <button
              key={secs}
              type="button"
              className={"segmented-btn" + (secs === chosen ? " active" : "")}
              onClick={() => setRest(secs)}
            >
              {formatDuration(secs)}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--block" onClick={() => onStart(chosen)}>
        Empezar {routine.name}
      </button>
    </Modal>
  );
}
