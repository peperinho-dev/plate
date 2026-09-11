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
import {XIcon} from "../../../shared/components/Icons";
import { useAppStore } from "../../../shared/store";
import { computeExerciseCatalog, searchCatalog } from "../../../shared/lib/workouts";
import { foldText } from "../../../shared/lib/text";
import { suggestMovements, shareFromName } from "../../../shared/lib/bodyweight";
import { relativeDayLabel } from "../../../shared/lib/format";
import type { Exercise, Routine, TimerPreset } from "../../../shared/store/types";
import { removeExercise, removeRoutine, startRoutine } from "../actions";
import { TimerSection } from "./TimerSection";
import { LibrarySection } from "./LibrarySection";
import { RoutineModal } from "./RoutineModal";
import { RoutineStartSheet } from "./RoutineStartSheet";
import { useSectionCollapse } from "../useSectionCollapse";

interface AddWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  dayKey: string;
  exercises: Exercise[];
  onAddExercise: (name: string) => void;
  onRunTimer: (timer: TimerPreset) => void;
  onLogTimer: (timer: TimerPreset) => void;
}

export function AddWorkoutModal({
  open,
  onClose,
  dayKey,
  exercises,
  onAddExercise,
  onRunTimer,
  onLogTimer
}: AddWorkoutModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const routines = useAppStore((s) => s.routines);
  const { isExpanded, toggle } = useSectionCollapse(workouts, dayKey);

  const [query, setQuery] = useState("");
  const [routinesEditing, setRoutinesEditing] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  // Which routine is waiting on its start sheet.
  const [pendingRoutine, setPendingRoutine] = useState<Routine | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  const catalog = computeExerciseCatalog(workouts, dayKey);
  const results = searchCatalog(catalog, query).slice(0, 12);
  const trimmed = query.trim();
  // Known movements that match what is being typed, minus any you have
  // already logged — those are in `results` with their real history, which
  // is more useful than a canonical name.
  const logged = new Set(catalog.map((e) => foldText(e.name)));
  const suggestions = suggestMovements(trimmed).filter((m) => !logged.has(foldText(m.name)));
  // Whether a freely typed name would count as bodyweight, so creating one
  // that scores nothing is a visible choice rather than a silent surprise.
  const typedShare = shareFromName(trimmed);
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
          {suggestions.map((m) => (
            <div className="row" key={`known-${m.name}`}>
              <button type="button" className="row-main" onClick={() => add(m.name)}>
                <span className="row-name">{m.name}</span>
                <span className="row-qty">
                  Cuenta como {Math.round(m.share * 100)} % del peso corporal
                </span>
              </button>
            </div>
          ))}
          {canCreate && (
            <div className="row">
              <button type="button" className="row-main" onClick={() => add(trimmed)}>
                <span className="row-name">Crear “{trimmed}”</span>
                <span className="row-qty">
                  {typedShare > 0
                    ? `Cuenta como ${Math.round(typedShare * 100)} % del peso corporal`
                    : "No contará peso corporal en el volumen"}
                </span>
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

        {/* Routines sit with the exercises, not with the timers. Starting
            one is how a session usually begins — it adds several exercises
            at once — and it was buried between Calentamiento and
            Estiramientos, 685px down a 751px sheet, on the reasoning that
            the sheet mirrors the order a session runs in. But the work
            itself is the search field at the top, so that ordering was
            never really holding: a routine belongs next to the other way
            of adding exercises. */}
        <div className="workout-pickers">
          <LibrarySection
            title="Rutinas"
            count={routines.length}
            expanded={isExpanded("routines")}
            onToggle={() => toggle("routines")}
            emptyHint="Ninguna todavía."
            actions={
              <>
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
              </>
            }
          >
            {routines.map((r) => (
              <div className="row" key={r.id}>
                <button
                  type="button"
                  className="row-main"
                  onClick={() => setPendingRoutine(r)}
                >
                  <span className="row-name">{r.name}</span>
                  <span className="row-qty">
                    {r.exerciseNames.length} {r.exerciseNames.length === 1 ? "ejercicio" : "ejercicios"}
                    {r.exerciseNames.length > 0 ? ` · ${r.exerciseNames.join(", ")}` : ""}
                  </span>
                </button>
                {routinesEditing && (
                  <button
                    type="button"
                    className="row-del"
                    aria-label={`Quitar ${r.name}`}
                    onClick={() => removeRoutine(r.id)}
                  >
                    <XIcon />
                  </button>
                )}
              </div>
            ))}
          </LibrarySection>

        </div>

        {/* Warm-up and stretches: the two timer sections, kept together
            and last, since they bracket the session rather than being it. */}
        <div className="workout-pickers">
          <TimerSection
            category="warmup"
            label="Calentamiento"
            expanded={isExpanded("warmup")}
            onToggle={() => toggle("warmup")}
            onRun={onRunTimer}
            onLog={onLogTimer}
          />


          <TimerSection
            category="stretch"
            label="Estiramientos"
            expanded={isExpanded("stretch")}
            onToggle={() => toggle("stretch")}
            onRun={onRunTimer}
            onLog={onLogTimer}
          />
        </div>
      </Modal>

      <RoutineStartSheet
        routine={pendingRoutine}
        onClose={() => setPendingRoutine(null)}
        onStart={(restSeconds) => {
          if (!pendingRoutine) return;
          startRoutine(dayKey, pendingRoutine.exerciseNames, pendingRoutine.name, restSeconds);
          showToast(`${pendingRoutine.name} empezada`);
          setPendingRoutine(null);
          onClose();
        }}
      />

      <RoutineModal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        initialExercises={exercises.map((e) => e.name)}
        nameOptions={catalog.map((e) => e.name)}
      />
    </>
  );
}
