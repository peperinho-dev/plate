// Everything you can add to a session, behind one "Añadir" button.
//
// Replaces the old always-visible timers/routines card: mid-workout those
// pickers are noise, and the day card should be the session, not the
// menu. Sections fold away once you've used them today (see
// useSectionCollapse), so the sheet gets shorter as the session goes on.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { ChevronDown } from "../../../shared/components/Icons";
import { useAppStore } from "../../../shared/store";
import { computeFrequentExercises } from "../../../shared/lib/workouts";
import type { Exercise, TimerPreset } from "../../../shared/store/types";
import { removeRoutine, startRoutine } from "../actions";
import { TimerSection } from "./TimerSection";
import { RoutineModal } from "./RoutineModal";
import { useSectionCollapse } from "../useSectionCollapse";

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  dayKey: string;
  exercises: Exercise[];
  nameOptions: string[];
  onAddExercise: (name: string) => void;
  onRunTimer: (timer: TimerPreset) => void;
}

export function AddWorkoutModal({
  open,
  onClose,
  dayKey,
  exercises,
  nameOptions,
  onAddExercise,
  onRunTimer
}: AddWorkoutModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const routines = useAppStore((s) => s.routines);
  const frequent = computeFrequentExercises(workouts);
  const { isExpanded, toggle } = useSectionCollapse(workouts, dayKey);

  const [name, setName] = useState("");
  const [routinesEditing, setRoutinesEditing] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName("");
  }

  return (
    <>
      <Modal open={open} title="Añadir" onClose={onClose}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onAddExercise(trimmed);
          }}
        >
          <label className="field">
            <span>Ejercicio</span>
            <input
              type="text"
              placeholder="p. ej. Press banca"
              list="exerciseNameList"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <datalist id="exerciseNameList">
              {nameOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()}>
            Añadir
          </button>
        </form>

        {/* Order follows how a session actually runs: warm up, do the
            work, stretch. The day card lists them back in the same order. */}
        <TimerSection
          category="warmup"
          label="Calentamiento"
          expanded={isExpanded("warmup")}
          onToggle={() => toggle("warmup")}
          onRun={onRunTimer}
        />

        <div className="quick-section">
          <div className="quick-label-row">
            <button type="button" className="quick-label-toggle" onClick={() => toggle("routines")}>
              <span className="quick-label">Rutinas</span>
              <span className={"quick-label-chevron" + (isExpanded("routines") ? "" : " is-collapsed")}>
                <ChevronDown />
              </span>
            </button>
            {isExpanded("routines") && (
              <div className="quick-label-actions">
                <button type="button" className="link-btn" onClick={() => setRoutineOpen(true)}>
                  + Nueva
                </button>
                {routines.length > 0 && (
                  <button
                    type="button"
                    className="link-btn link-btn--muted"
                    onClick={() => setRoutinesEditing((v) => !v)}
                  >
                    {routinesEditing ? "Listo" : "Editar"}
                  </button>
                )}
              </div>
            )}
          </div>
          {isExpanded("routines") && routines.length > 0 && (
            <div className="quick-row">
              {routines.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="quick-chip"
                  onClick={() => {
                    if (routinesEditing) {
                      removeRoutine(r.id);
                      return;
                    }
                    startRoutine(dayKey, r.exerciseNames);
                    onClose();
                    showToast(`${r.name} añadida`);
                  }}
                >
                  <span className="quick-chip-name">{r.name}</span>
                  <span className="quick-chip-kcal">{r.exerciseNames.length} ej.</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <TimerSection
          category="stretch"
          label="Estiramientos"
          expanded={isExpanded("stretch")}
          onToggle={() => toggle("stretch")}
          onRun={onRunTimer}
        />

        {frequent.length > 0 && (
          <div className="quick-section">
            <div className="quick-label-row">
              <button
                type="button"
                className="quick-label-toggle"
                onClick={() => toggle("exercises")}
              >
                <span className="quick-label">Ejercicios recientes</span>
                <span
                  className={"quick-label-chevron" + (isExpanded("exercises") ? "" : " is-collapsed")}
                >
                  <ChevronDown />
                </span>
              </button>
            </div>
            {isExpanded("exercises") && (
              <div className="quick-row">
                {frequent.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className="quick-chip"
                    onClick={() => onAddExercise(f.name)}
                  >
                    <span className="quick-chip-name">{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <RoutineModal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        initialExercises={exercises.map((e) => e.name)}
        nameOptions={nameOptions}
      />
    </>
  );
}
