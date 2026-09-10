// The set table: one row per set, edited in place.
//
// Replaces a form that sat permanently below the list — two segmented
// controls, two inputs and a submit button — where logging a second set
// meant re-reading a form you had already filled in. The reference app
// puts the sets themselves in a table with editable cells, and adding a
// set is one tap that pre-fills from what you did last time.
//
// Cells commit on blur rather than on every keystroke: the store persists
// to localStorage on write, and "6" on the way to "60" is not a number
// anyone typed.
import { useEffect, useRef, useState } from "react";
import { XIcon, PlusIcon } from "../../../shared/components/Icons";
import type { Exercise, ExerciseSet, SetType } from "../../../shared/store/types";
import { formatSet, isHoldSet } from "../../../shared/lib/workouts";
import { patchSet, removeSet } from "../actions";

const SET_TYPE_LABELS: Record<Exclude<SetType, "normal">, string> = {
  warmup: "Cal.",
  failure: "Fallo",
  dropset: "Drop"
};
// Cycled by tapping the tag. Four states is few enough to walk through,
// and the current one is always on screen, so nothing is hidden behind
// the gesture.
const SET_TYPES: SetType[] = ["normal", "warmup", "failure", "dropset"];

function Cell({
  value,
  placeholder,
  onCommit,
  ariaLabel
}: {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (v: number | null) => void;
  ariaLabel: string;
}) {
  const asText = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(asText);
  // Re-sync only when the stored value itself changes — an edit made
  // elsewhere, or this cell's own commit landing.
  //
  // Keying this off a "focused" flag instead was wrong: any render while
  // the flag was stale reverted what was being typed, because the store
  // still held the old number and the cell dutifully mirrored it back.
  // Tracking the last value seen from the store has no such window.
  const [lastSeen, setLastSeen] = useState(asText);
  if (lastSeen !== asText) {
    setLastSeen(asText);
    setDraft(asText);
  }

  const parse = (text: string): number | null => {
    const t = text.trim();
    if (t === "") return null;
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Blur is the obvious moment to save, but it isn't guaranteed to
  // happen: closing the sheet by tapping the backdrop can unmount the
  // input without one, which would drop the number silently. A short
  // debounce means the value is already stored by then, and still costs
  // one write per pause rather than one per keystroke.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    if (draft === asText) return;
    const id = setTimeout(() => commitRef.current(parse(draft)), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, asText]);

  return (
    <input
      className="set-cell"
      type="number"
      inputMode="decimal"
      step="any"
      min="0"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(parse(draft))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

interface SetTableProps {
  exercise: Exercise;
  dayKey: string;
  /** Matching sets from the last session, indexed the same way. */
  previous: ExerciseSet[] | null;
  mode: "reps" | "hold";
  onAddSet: () => void;
}

export function SetTable({ exercise, dayKey, previous, mode, onAddSet }: SetTableProps) {
  return (
    <div className="set-table">
      <div className="set-head">
        <span className="set-col-n">Serie</span>
        <span className="set-col-prev">Anterior</span>
        <span className="set-col-cell">kg</span>
        <span className="set-col-cell">{mode === "hold" ? "seg" : "reps"}</span>
        <span className="set-col-del" />
      </div>

      {exercise.sets.map((s, i) => {
        const hold = isHoldSet(s);
        const prev = previous?.[i];
        const type = s.type || "normal";
        return (
          <div className="set-row" key={s.id}>
            <span className="set-col-n">
              <span className="set-n">{i + 1}</span>
              <button
                type="button"
                className={"set-type set-type--" + type}
                aria-label={`Tipo de la serie ${i + 1}`}
                onClick={() => {
                  const next = SET_TYPES[(SET_TYPES.indexOf(type) + 1) % SET_TYPES.length];
                  patchSet(dayKey, exercise.id, s.id, { type: next });
                }}
              >
                {type === "normal" ? "—" : SET_TYPE_LABELS[type as Exclude<SetType, "normal">]}
              </button>
            </span>

            <span className="set-col-prev">{prev ? formatSet(prev) : "—"}</span>

            <span className="set-col-cell">
              <Cell
                value={s.weightKg}
                placeholder="—"
                ariaLabel={`Peso de la serie ${i + 1}`}
                onCommit={(v) => patchSet(dayKey, exercise.id, s.id, { weightKg: v })}
              />
            </span>

            <span className="set-col-cell">
              <Cell
                value={hold ? s.holdSeconds : s.reps}
                ariaLabel={`${hold ? "Segundos" : "Reps"} de la serie ${i + 1}`}
                onCommit={(v) =>
                  patchSet(
                    dayKey,
                    exercise.id,
                    s.id,
                    hold ? { holdSeconds: v, reps: null } : { reps: v, holdSeconds: null }
                  )
                }
              />
            </span>

            <span className="set-col-del">
              <button
                type="button"
                className="row-del"
                aria-label={`Quitar serie ${i + 1}`}
                onClick={() => removeSet(dayKey, exercise.id, s.id)}
              >
                <XIcon />
              </button>
            </span>
          </div>
        );
      })}

      <button type="button" className="set-add" onClick={onAddSet}>
        <PlusIcon />
        <span>Añadir serie</span>
      </button>
    </div>
  );
}
