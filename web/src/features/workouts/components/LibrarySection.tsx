// One collapsible section of the workout library — warm-ups, routines,
// stretches.
//
// These were three hand-rolled copies of the same markup, which is why
// they had already drifted apart, and each rendered its contents as a
// horizontal row of pill chips capped at 220px. That capping is what
// turned "Estiramiento post" into "Estiramiento p…", and the horizontal
// scroll hid however many presets didn't fit — the same two faults the
// insights carousel had.
//
// The reference app's library is a list: a titled section, a row per
// saved thing, name and a line of detail. Rows here are the app's own
// .row, the same ones the exercise results above them use, so a preset
// and an exercise read alike in the same sheet.
//
// The actions stay mounted whether or not the section is open. Revealing
// them on expand made the header jump and hid "+ Nueva" behind a
// disclosure you had no reason to open when the section was empty.
import type { ReactNode } from "react";
import { ChevronDown } from "../../../shared/components/Icons";

interface LibrarySectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** "+ Nueva", "Editar" — always visible. */
  actions?: ReactNode;
  emptyHint?: string;
  children?: ReactNode;
}

export function LibrarySection({
  title,
  count,
  expanded,
  onToggle,
  actions,
  emptyHint,
  children
}: LibrarySectionProps) {
  return (
    <section className="lib-section">
      <div className="lib-head">
        <button
          type="button"
          className="lib-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={count === 0}
        >
          <span className={"lib-chevron" + (expanded ? "" : " is-collapsed")}>
            <ChevronDown />
          </span>
          <span className="lib-title">{title}</span>
          {count > 0 && <span className="lib-count">{count}</span>}
        </button>
        {actions && <div className="lib-actions">{actions}</div>}
      </div>

      {expanded && count > 0 && <div className="log-list">{children}</div>}
      {count === 0 && emptyHint && <p className="lib-empty">{emptyHint}</p>}
    </section>
  );
}
