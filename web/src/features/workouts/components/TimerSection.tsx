// Warmup / stretch timer presets inside the "Añadir" sheet: tap one to
// run it, "+ Nueva" to build one. Chips show total duration and step
// count, so a three-step mobility routine reads differently from a single
// ten-minute jog.
import { useState } from "react";
import { useAppStore } from "../../../shared/store";
import { ChevronDown, XIcon } from "../../../shared/components/Icons";
import { formatDuration } from "../../../shared/lib/workouts";
import type { TimerCategory, TimerPreset } from "../../../shared/store/types";
import { removeTimerPreset, timerTotalSeconds } from "../actions";
import { TimerBuilderModal } from "./TimerBuilderModal";

interface TimerSectionProps {
  category: TimerCategory;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onRun: (timer: TimerPreset) => void;
}

export function TimerSection({ category, label, expanded, onToggle, onRun }: TimerSectionProps) {
  // The selector must return a stable reference: filtering inside it
  // would build a new array on every call, so the store's snapshot would
  // never compare equal and React would re-render forever.
  const allTimers = useAppStore((s) => s.timers);
  const timers = allTimers.filter((t) => t.category === category);
  const [editing, setEditing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <div className="quick-section">
      <div className="quick-label-row">
        <button type="button" className="quick-label-toggle" onClick={onToggle}>
          <span className="quick-label">{label}</span>
          <span className={"quick-label-chevron" + (expanded ? "" : " is-collapsed")}>
            <ChevronDown />
          </span>
        </button>
        {expanded && (
          <div className="quick-label-actions">
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
          </div>
        )}
      </div>

      {expanded && timers.length > 0 && (
        <div className="quick-row">
          {timers.map((t) => (
            <button
              key={t.id}
              type="button"
              className="quick-chip"
              onClick={() => (editing ? removeTimerPreset(t.id) : onRun(t))}
            >
              <span className="quick-chip-name">{t.name}</span>
              <span className="quick-chip-kcal">
                {formatDuration(timerTotalSeconds(t))}
                {t.intervals.length > 1 ? ` · ${t.intervals.length} pasos` : ""}
              </span>
              {editing && (
                <span className="quick-chip-del" aria-label="Quitar">
                  <XIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <TimerBuilderModal
        open={builderOpen}
        category={category}
        onClose={() => setBuilderOpen(false)}
      />
    </div>
  );
}
