// Entreno settings.
//
// These two existed in the store and were reachable from an Análisis card
// that got cut when the dashboard was rebuilt around MacroFactor's widget
// set. The rings kept reading the weekly goal and the rest timer kept
// reading the default, but nothing could change either any more — the
// settings were orphaned rather than removed.
import { Modal } from "../../shared/components/Modal";
import { useAppStore } from "../../shared/store";
import { setRestSeconds, setWeeklySessionGoal } from "../workouts/actions";
import { formatDuration } from "../../shared/lib/workouts";

interface WorkoutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// The same ladder the rest timer offers mid-set, so the default and the
// in-workout presets can't disagree.
const REST_CHOICES = [30, 45, 60, 90, 120, 180];

export function WorkoutSettingsModal({ open, onClose }: WorkoutSettingsModalProps) {
  const goal = useAppStore((s) => s.workoutGoal);

  return (
    <Modal open={open} title="Entreno" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>
            Sesiones por semana: {goal.weeklySessions}{" "}
            <span className="field-optional">· el objetivo de los anillos</span>
          </span>
          <input
            type="range"
            min="1"
            max="7"
            step="1"
            value={goal.weeklySessions}
            onChange={(e) => setWeeklySessionGoal(parseInt(e.target.value, 10))}
          />
        </label>

        <div className="field">
          <span>
            Descanso por defecto{" "}
            <span className="field-optional">· al completar una serie</span>
          </span>
          <div className="segmented segmented--compact">
            {REST_CHOICES.map((secs) => (
              <button
                key={secs}
                type="button"
                className={"segmented-btn" + (goal.restSeconds === secs ? " active" : "")}
                onClick={() => setRestSeconds(secs)}
              >
                {formatDuration(secs)}
              </button>
            ))}
          </div>
        </div>

      </div>
    </Modal>
  );
}
