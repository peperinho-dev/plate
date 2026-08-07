// Everything you can add to a session, behind one "Añadir" button.
//
// Search-first: one field filters one ranked list of every exercise
// you've ever logged. The old sheet had two mechanisms for the same
// intent — type a name into a datalist, or tap a chip from a separate
// "recientes" row — and typing didn't filter the chips. Recents are just
// the top of the list now.
//
// Adding does not close the sheet. A session is several exercises, so
// closing after each one meant reopening from the action bar every time;
// instead they collect in a track at the top where they can be undone.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { ChevronDown, XIcon } from "../../../shared/components/Icons";
import { useAppStore } from "../../../shared/store";
import { computeExerciseCatalog, searchCatalog, foldText } from "../../../shared/lib/workouts";
import { relativeDayLabel } from "../../../shared/lib/format";
import type { Exercise, TimerPreset } from "../../../shared/store/types";
import { removeExercise, removeRoutine, startRoutine } from "../actions";
import { TimerSection } from "./TimerSection";
import { RoutineModal } from "./RoutineModal";
import { useSectionCollapse } from "../useSectionCollapse";

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  dayKey: string;
  exercises: Exercise[];
  onAddExercise: (name: string) => void;
  onRunTimer: (timer: TimerPreset) => void;
}

export function AddWorkoutModal({
  open,
  onClose,
  dayKey,
  exercises,
  onAddExercise,
  onRunTimer
}: AddWorkoutModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const routines = useAppStore((s) => s.routines);
  const { isExpanded, toggle } = useSectionCollapse(workouts, dayKey);

  const [query, setQuery] = useState("");
  const [routinesEditing, setRoutinesEditing] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  const catalog = computeExerciseCatalog(workouts, dayKey);
  const results = searchCatalog(catalog, query).slice(0, 12);
  const trimmed = query.trim();
  // Only offer to create when nothing in the catalog already *is* what was
  // typed — otherwise the create row shadows the real entry.
  const canCreate =
    trimmed.length > 0 && !catalog.some((e) => foldText(e.name) === foldText(trimmed));

  const add = (name: string) => {
    onAddExercise(name);
    setQuery("");
  };

  return (
    <>
      <Modal open={open} title="Añadir" onClose={onClose}>
        <label className="field">
          <span>Ejercicio</span>
          <input
            type="search"
            inputMode="search"
            placeholder="Buscar o crear…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Enter takes the obvious thing: the top match, or the new
              // name when there isn't one.
              if (results.length > 0) add(results[0].name);
              else if (trimmed) add(trimmed);
            }}
            autoFocus
          />
        </label>

        {exercises.length > 0 && (
          <div className="added-track">
            <span className="added-track-label">Hoy</span>
            <div className="quick-row">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="quick-chip"
                  onClick={() => removeExercise(dayKey, ex.id)}
                  aria-label={`Quitar ${ex.name}`}
                >
                  <span className="quick-chip-name">{ex.name}</span>
                  <span className="quick-chip-del">
                    <XIcon />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="log-list">
          {canCreate && (
            <div className="row">
              <button type="button" className="row-main" onClick={() => add(trimmed)}>
                <span className="row-name">Crear “{trimmed}”</span>
                <span className="row-qty">Ejercicio nuevo</span>
              </button>
            </div>
          )}
          {results.map((e) => (
            <div className="row" key={e.name}>
              <button type="button" className="row-main" onClick={() => add(e.name)}>
                <span className="row-name">{e.name}</span>
                <span className="row-qty">
                  {e.lastDayKey
                    ? `${relativeDayLabel(e.lastDayKey, dayKey)} · ${e.lastSummary}`
                    : "Sin series previas"}
                </span>
              </button>
            </div>
          ))}
          {!canCreate && results.length === 0 && (
            <p className="empty-state empty-state--inline">
              {catalog.length === 0 ? "Escribe para crear tu primer ejercicio." : "Sin resultados."}
            </p>
          )}
        </div>

        {/* Order follows how a session actually runs: warm up, do the
            work, stretch. The day card lists them back in the same order. */}
        <div className="workout-pickers">
          <TimerSection
            category="warmup"
            label="Calentamiento"
            expanded={isExpanded("warmup")}
            onToggle={() => toggle("warmup")}
            onRun={onRunTimer}
          />

          <div
            className={"quick-section" + (isExpanded("routines") ? "" : " quick-section--collapsed")}
          >
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
        </div>
      </Modal>

      <RoutineModal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        initialExercises={exercises.map((e) => e.name)}
        nameOptions={catalog.map((e) => e.name)}
      />
    </>
  );
}
