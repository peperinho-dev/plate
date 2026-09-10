// The day as a timeline of hours.
//
// Every hour between the first meal and now is drawn, not only the ones
// with food in them: an empty hour is a place you might want to log the
// snack you forgot, and it can only be tapped if it's on screen. Each
// hour carries its own totals and its own + , so adding at 11am is one
// tap from the 11am row rather than a trip through a time picker.
import { AnimatePresence, motion } from "framer-motion";
import type { Entry } from "../../../shared/store/types";
import { timelineHours } from "../../../shared/lib/nutrition";
import { useUiStore } from "../../../shared/store/ui";
import { ChevronDown, PlusIcon } from "../../../shared/components/Icons";
import { EntryRow } from "./EntryRow";

interface EntryListProps {
  entries: Entry[];
  dayKey: string;
  /** Current hour when the day on screen is today; null otherwise. */
  throughHour: number | null;
  onEdit: (entry: Entry) => void;
  onEditGroup: (entry: Entry) => void;
  onEditItem: (entry: Entry, itemIndex: number) => void;
  onAddAtHour: (hour: number) => void;
}

export function EntryList({
  entries,
  dayKey,
  throughHour,
  onEdit,
  onEditGroup,
  onEditItem,
  onAddAtHour
}: EntryListProps) {
  const collapsedHourGroups = useUiStore((s) => s.collapsedHourGroups);
  const toggleHourGroup = useUiStore((s) => s.toggleHourGroup);
  const groups = timelineHours(entries, throughHour);

  return (
    <div className="log-list">
      {groups.map(({ hour, entries: groupEntries, total, macros }) => {
        const groupKey = `${dayKey}-${hour}`;
        const collapsed = collapsedHourGroups.has(groupKey);
        const empty = groupEntries.length === 0;
        return (
          <div className={"hour-group" + (empty ? " is-empty" : "")} key={groupKey}>
            <div className="hour-header">
              <button
                type="button"
                className="hour-toggle"
                onClick={() => !empty && toggleHourGroup(groupKey)}
                // An empty hour has nothing to collapse, so its label is
                // not pretending to be a control.
                disabled={empty}
              >
                <span className="hour-time">{String(hour).padStart(2, "0")}:00</span>
                {!empty && (
                  <span className="hour-macros">
                    <span className="hour-kcal">{Math.round(total)}</span>
                    <span className="hour-macro">{Math.round(macros.protein)}P</span>
                    <span className="hour-macro">{Math.round(macros.fat)}G</span>
                    <span className="hour-macro">{Math.round(macros.carbs)}C</span>
                  </span>
                )}
                {!empty && (
                  <span className={"hour-chevron" + (collapsed ? " is-collapsed" : "")}>
                    <ChevronDown />
                  </span>
                )}
              </button>
              <button
                type="button"
                className="hour-add"
                aria-label={`Añadir a las ${String(hour).padStart(2, "0")}:00`}
                onClick={() => onAddAtHour(hour)}
              >
                <PlusIcon />
              </button>
            </div>
            {!empty && !collapsed && (
              <div className="hour-entries">
                {/*
                  Rows animate in and out rather than popping. `layout` also
                  makes the surviving rows slide up to close the gap when
                  one is deleted, which matters now that a swipe can remove
                  a row from the middle of the list.
                */}
                <AnimatePresence initial={false}>
                  {groupEntries.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <EntryRow
                        entry={entry}
                        dayKey={dayKey}
                        onEdit={onEdit}
                        onEditGroup={onEditGroup}
                        onEditItem={onEditItem}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
