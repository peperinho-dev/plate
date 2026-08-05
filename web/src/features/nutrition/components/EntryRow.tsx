// Ported from buildEntryRow()/buildGroupEntryRow() in app.js. A "group"
// entry is a merged meal carrying its own ingredient list; it renders an
// expandable row with per-ingredient sub-rows. Plain entries render flat.
import type { Entry } from "../../../shared/store/types";
import { formatTime } from "../../../shared/lib/format";
import { scaleFoodItem } from "../../../shared/lib/foodItems";
import { ChevronDown, XIcon } from "../../../shared/components/Icons";
import { useUiStore } from "../../../shared/store/ui";
import { deleteEntry, deleteGroupItem } from "../actions";

interface EntryRowProps {
  entry: Entry;
  dayKey: string;
}

function MacroLine({ entry }: { entry: Entry }) {
  if (!(entry.protein || entry.fat || entry.carbs)) return null;
  return (
    <span className="row-macros">
      {Math.round(entry.protein || 0)}P · {Math.round(entry.fat || 0)}F · {Math.round(entry.carbs || 0)}C
    </span>
  );
}

export function EntryRow({ entry, dayKey }: EntryRowProps) {
  const expandedGroups = useUiStore((s) => s.expandedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedEntryIds = useUiStore((s) => s.selectedEntryIds);
  const toggleEntrySelection = useUiStore((s) => s.toggleEntrySelection);

  const qtyPrefix = entry.qtyLabel ? `${entry.qtyLabel} · ` : "";
  const isChecked = selectedEntryIds.has(entry.id);

  const selectMark = selectionMode ? (
    <span className={"row-select-check" + (isChecked ? " is-checked" : "")} />
  ) : null;

  if (!entry.items) {
    return (
      <div className="row" data-id={entry.id}>
        {selectMark}
        <button
          type="button"
          className={"row-main " + (selectionMode ? "row-select" : "row-edit")}
          data-id={entry.id}
          onClick={selectionMode ? () => toggleEntrySelection(entry.id) : undefined}
        >
          <span className="row-name">{entry.name}</span>
          <span className="row-qty">
            {qtyPrefix}
            {formatTime(entry.addedAt)}
          </span>
          <MacroLine entry={entry} />
        </button>
        <span className="row-amount">{Math.round(entry.calories)} kcal</span>
        {!selectionMode && (
          <button className="row-del" aria-label="Quitar" onClick={() => deleteEntry(dayKey, entry.id)}>
            <XIcon />
          </button>
        )}
      </div>
    );
  }

  // A group never shows its ingredients while selecting — the row is a
  // selection target then, not an expander.
  const isExpanded = !selectionMode && expandedGroups.has(entry.id);

  return (
    <div className="row row-group" data-id={entry.id}>
      <div className="row-main-line">
        {selectMark}
        <button
          type="button"
          className={"row-main " + (selectionMode ? "row-select" : "row-group-toggle")}
          onClick={selectionMode ? () => toggleEntrySelection(entry.id) : () => toggleGroup(entry.id)}
        >
          <span className="row-name">
            {entry.name}{" "}
            <span className={"row-chevron-inline" + (isExpanded ? " is-expanded" : "")}>
              <ChevronDown />
            </span>
          </span>
          <span className="row-qty">
            {qtyPrefix}
            {formatTime(entry.addedAt)}
          </span>
          <MacroLine entry={entry} />
        </button>
        <span className="row-amount">{Math.round(entry.calories)} kcal</span>
        {!selectionMode && (
          <button className="row-del" aria-label="Quitar" onClick={() => deleteEntry(dayKey, entry.id)}>
            <XIcon />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="group-items">
          {entry.items.map((item, i) => {
            const scaled = scaleFoodItem(item);
            return (
              <div className="sub-row" key={`${entry.id}-${i}`}>
                <button type="button" className="sub-row-main">
                  <span className="sub-row-name">{item.name}</span>
                  <span className="sub-row-qty">{Math.round(item.grams)} g</span>
                </button>
                <span className="sub-row-amount">{Math.round(scaled.calories)} kcal</span>
                <button
                  className="sub-row-del"
                  aria-label="Quitar"
                  onClick={() => deleteGroupItem(dayKey, entry.id, i)}
                >
                  <XIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
