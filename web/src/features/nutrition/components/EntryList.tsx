// Timeline of the day's entries, bucketed by the hour they were logged.
// Ported from renderEntryTimeline() in app.js — groups default collapsed
// so the day view opens tidy.
import { AnimatePresence, motion } from "framer-motion";
import type { Entry } from "../../../shared/store/types";
import { groupEntriesByHour } from "../../../shared/lib/nutrition";
import { useUiStore } from "../../../shared/store/ui";
import { ChevronDown } from "../../../shared/components/Icons";
import { EntryRow } from "./EntryRow";

interface EntryListProps {
  entries: Entry[];
  dayKey: string;
  onEdit: (entry: Entry) => void;
  onEditGroup: (entry: Entry) => void;
  onEditItem: (entry: Entry, itemIndex: number) => void;
}

export function EntryList({ entries, dayKey, onEdit, onEditGroup, onEditItem }: EntryListProps) {
  const expandedHourGroups = useUiStore((s) => s.expandedHourGroups);
  const toggleHourGroup = useUiStore((s) => s.toggleHourGroup);
  const groups = groupEntriesByHour(entries);

  return (
    <div className="log-list">
      {groups.map(({ hour, entries: groupEntries, total }) => {
        const groupKey = `${dayKey}-${hour}`;
        const collapsed = !expandedHourGroups.has(groupKey);
        return (
          <div className="hour-group" key={groupKey}>
            <button type="button" className="hour-header" onClick={() => toggleHourGroup(groupKey)}>
              <span className="hour-time">{String(hour).padStart(2, "0")}:00</span>
              <span className="hour-summary">
                {groupEntries.length} · {Math.round(total)} kcal
              </span>
              <span className={"hour-chevron" + (collapsed ? " is-collapsed" : "")}>
                <ChevronDown />
              </span>
            </button>
            {!collapsed && (
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
                      <EntryRow entry={entry} dayKey={dayKey} onEdit={onEdit} onEditGroup={onEditGroup} onEditItem={onEditItem} />
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
