// Warmup / stretch timer presets inside the "Añadir" sheet: tap one to
// run it, "+ Nueva" to build one. Each row shows total duration and step
// count, so a three-step mobility routine reads differently from a
// single ten-minute jog.
import { useState } from "react";
import { useAppStore } from "../../../shared/store";
import { PlusIcon, XIcon } from "../../../shared/components/Icons";
import { formatDuration } from "../../../shared/lib/workouts";
import type { TimerCategory, TimerPreset } from "../../../shared/store/types";
import { removeTimerPreset, timerTotalSeconds } from "../actions";
import { TimerBuilderModal } from "./TimerBuilderModal";
import { LibrarySection } from "./LibrarySection";

interface TimerSectionProps {
  category: TimerCategory;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onRun: (timer: TimerPreset) => void;
  /** Record it as done without running the countdown. */
  onLog: (timer: TimerPreset) => void;
}

export function TimerSection({ category, label, expanded, onToggle, onRun, onLog }: TimerSectionProps) {
  // The selector must return a stable reference: filtering inside it
  // would build a new array on every call, so the store's snapshot would
  // never compare equal and React would re-render forever.
  const allTimers = useAppStore((s) => s.timers);
  const timers = allTimers.filter((t) => t.category === category);
  const [editing, setEditing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <>
      <LibrarySection
        title={label}
        count={timers.length}
        expanded={expanded}
        onToggle={onToggle}
        emptyHint="Ninguno todavía."
        actions={
          <>
            <button type="button" className="link-btn" onClick={() => setBuilderOpen(true)}>
              + Nueva
            </button>
            {timers.length > 0 && (
              <button
                type="button"
                className="link-btn link-btn--muted"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Listo" : "Editar"}
              </button>
            )}
          </>
        }
      >
        {timers.map((t) => (
          <div className="row" key={t.id}>
            <button type="button" className="row-main" onClick={() => onRun(t)}>
              <span className="row-name">{t.name}</span>
              <span className="row-qty">
                {formatDuration(timerTotalSeconds(t))}
                {t.intervals.length > 1 ? ` · ${t.intervals.length} pasos` : ""}
              </span>
            </button>
            {editing ? (
              <button
                type="button"
                className="row-del"
                aria-label={`Quitar ${t.name}`}
                onClick={() => removeTimerPreset(t.id)}
              >
                <XIcon />
              </button>
            ) : (
              /* Two verbs, as on a food search result: the row runs the
                 countdown, this records it as already done. Without it the
                 only way to log a warm-up you did away from the phone was
                 to stand there and watch four minutes elapse. */
              <button
                type="button"
                className="row-add"
                aria-label={`Registrar ${t.name} como hecho`}
                onClick={() => onLog(t)}
              >
                <PlusIcon />
              </button>
            )}
          </div>
        ))}
      </LibrarySection>

      <TimerBuilderModal
        open={builderOpen}
        category={category}
        onClose={() => setBuilderOpen(false)}
      />
    </>
  );
}
