// The 24 hours of a day, as a grid you pick from.
//
// Used wherever an hour is a destination rather than a row you scroll to:
// moving a food to a different time, and adding one to an hour that isn't
// on screen. Four rows of six reads as a clock face you scan, and costs a
// fraction of the height of twenty-four list rows.
interface HourGridProps {
  onPick: (hour: number) => void;
  /** Drawn as chosen — the hour you are already looking at. */
  current?: number | null;
}

export function HourGrid({ onPick, current }: HourGridProps) {
  return (
    <div className="hour-picker">
      {Array.from({ length: 24 }, (_, h) => (
        <button
          key={h}
          type="button"
          className={"hour-picker-chip" + (h === current ? " is-current" : "")}
          onClick={() => onPick(h)}
        >
          {String(h).padStart(2, "0")}
        </button>
      ))}
    </div>
  );
}
