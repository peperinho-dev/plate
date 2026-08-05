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

  const qtyPrefix = entry.qtyLabel ? `${entry.qtyLabel} · ` : "";

  if (!entry.items) {
    return (
      <div className="row" data-id={entry.id}>
        <button type="button" className="row-main row-edit" data-id={entry.id}>
          <span className="row-name">{entry.name}</span>
          <span className="row-qty">
            {qtyPrefix}
            {formatTime(entry.addedAt)}
          </span>
          <MacroLine entry={entry} />
        </button>
        <span className="row-amount">{Math.round(entry.calories)} kcal</span>
        <button className="row-del" aria-label="Quitar" onClick={() => deleteEntry(dayKey, entry.id)}>
          <XIcon />
        </button>
      </div>
    );
  }

  const isExpanded = expandedGroups.has(entry.id);

  return (
    <div className="row row-group" data-id={entry.id}>
      <div className="row-main-line">
        <button type="button" className="row-main row-group-toggle" onClick={() => toggleGroup(entry.id)}>
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
        <button className="row-del" aria-label="Quitar" onClick={() => deleteEntry(dayKey, entry.id)}>
          <XIcon />
        </button>
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
