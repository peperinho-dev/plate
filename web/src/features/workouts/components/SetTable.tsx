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
import { playBeep, unlockBeep } from "../beep";
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

/**
 * Stopwatch for a hold.
 *
 * A hang or a plank is timed, not counted, and the only way to record one
 * was to hold it, guess, and type a number. It counts *up* rather than
 * down because a hold usually ends when you drop, not when a clock says
 * so — but it beeps as it passes the time you're aiming at, so a
 * prescribed 45s plank tells you, and holding past it still records the
 * longer time instead of capping you at the target.
 *
 * Elapsed comes from the wall clock for the same reason the interval
 * timer does: a phone on the floor stops delivering ticks.
 */
function useHoldStopwatch() {
  const [running, setRunning] = useState<{ setId: string; startedAt: number; target: number } | null>(
    null
  );
  const [elapsed, setElapsed] = useState(0);
  const beepedRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - running.startedAt) / 1000);
      setElapsed(secs);
      if (!beepedRef.current && running.target > 0 && secs >= running.target) {
        beepedRef.current = true;
        playBeep();
      }
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const start = (setId: string, target: number) => {
    unlockBeep();
    beepedRef.current = false;
    setElapsed(0);
    setRunning({ setId, startedAt: Date.now(), target });
  };

  /** Stops and returns the seconds held, rounded. */
  const stop = () => {
    if (!running) return null;
    const secs = Math.max(1, Math.round((Date.now() - running.startedAt) / 1000));
    setRunning(null);
    return secs;
  };

  return { runningId: running?.setId ?? null, target: running?.target ?? 0, elapsed, start, stop };
}

export function SetTable({ exercise, dayKey, previous, mode, onAddSet }: SetTableProps) {
  const watch = useHoldStopwatch();
  // "Anterior" pairs like with like rather than by row position. Position
  // breaks the moment warm-ups are prepended: every working set shifts
  // down and starts quoting the wrong session's set back at you. Warm-ups
  // match previous warm-ups, working sets match previous working sets.
  const previousFor = new Map<string, ExerciseSet>();
  if (previous) {
    const queue = { warmup: [...previous.filter((p) => p.type === "warmup")],
                    working: [...previous.filter((p) => p.type !== "warmup")] };
    exercise.sets.forEach((s) => {
      const lane = s.type === "warmup" ? queue.warmup : queue.working;
      const match = lane.shift();
      if (match) previousFor.set(s.id, match);
    });
  }

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
        const prev = previousFor.get(s.id);
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
              {hold && watch.runningId === s.id ? (
                <button
                  type="button"
                  className={
                    "hold-watch is-running" +
                    (watch.target > 0 && watch.elapsed >= watch.target ? " is-past" : "")
                  }
                  onClick={() => {
                    const secs = watch.stop();
                    if (secs != null) {
                      patchSet(dayKey, exercise.id, s.id, { holdSeconds: secs, reps: null });
                    }
                  }}
                >
                  {watch.elapsed}s
                </button>
              ) : (
                <>
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
                  {hold && (
                    <button
                      type="button"
                      className="hold-watch"
                      aria-label={`Cronometrar la serie ${i + 1}`}
                      // The target is what the set is already set to, which
                      // addSet seeds from your last one — so it is what you
                      // are trying to match or beat.
                      onClick={() => watch.start(s.id, s.holdSeconds ?? prev?.holdSeconds ?? 0)}
                    >
                      ▶
                    </button>
                  )}
                </>
              )}
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
