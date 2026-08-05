// Timeline of the day's entries, bucketed by the hour they were logged.
// Ported from renderEntryTimeline() in app.js — groups default collapsed
// so the day view opens tidy.
import type { Entry } from "../../../shared/store/types";
import { groupEntriesByHour } from "../../../shared/lib/nutrition";
import { useUiStore } from "../../../shared/store/ui";
import { ChevronDown } from "../../../shared/components/Icons";
import { EntryRow } from "./EntryRow";

interface EntryListProps {
  entries: Entry[];
  dayKey: string;
}

export function EntryList({ entries, dayKey }: EntryListProps) {
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
                {groupEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} dayKey={dayKey} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
