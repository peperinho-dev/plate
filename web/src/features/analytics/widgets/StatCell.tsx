// The canonical "how much of the target is this" cell.
//
// MacroFactor states this one way everywhere it appears: the pair on a
// single line as "consumed / target" with the unit suffixed, and a
// coloured bar directly beneath carrying the proportion. Every widget
// that shows intake against a target uses this, so the same fact doesn't
// arrive in a different shape on each page of the deck.
export type MacroKind = "kcal" | "protein" | "fat" | "carbs";

interface StatCellProps {
  value: number;
  target: number | null;
  /** Suffixed to the pair, as in "93 / 106 P". Calories carry none. */
  suffix?: string;
  kind: MacroKind;
  /** Labels what the number counts when it isn't consumption. */
  caption?: string;
}

export function StatCell({ value, target, suffix, kind, caption }: StatCellProps) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const met = target != null && value >= target;
  return (
    <div className={"stat-cell is-" + kind + (met ? " is-met" : "")}>
      <span className="stat-cell-pair">
        <span className="stat-cell-value">{Math.round(value)}</span>
        {target != null && <span className="stat-cell-target"> / {Math.round(target)}</span>}
        {suffix && <span className="stat-cell-suffix"> {suffix}</span>}
      </span>
      <span className="stat-cell-track">
        <span className="stat-cell-fill" style={{ width: `${pct}%` }} />
      </span>
      {caption && <span className="stat-cell-caption">{caption}</span>}
    </div>
  );
}
