// "Entreno semanal" — MacroFactor's Weekly Workouts widget, adapted.
//
// Theirs rings three counts against targets a training program supplies:
// muscles, sets and exercises. We have no programs and no muscle tagging,
// so only one of those three numbers has a real target — the weekly
// session goal, which the user sets themselves.
//
// Rather than invent targets for the other two, they ring against the
// user's own trailing four-week average and are labelled as such. A
// fabricated "objetivo" would read as something the app asked of you;
// "media" reads as what you actually do, which is the honest comparison.
import { useAppStore } from "../../../shared/store";
import { todayKey } from "../../../shared/lib/date";
import type { AppState } from "../../../shared/store/types";

interface Counts {
  sessions: number;
  sets: number;
  exercises: number;
}

function countRange(workouts: AppState["workouts"], keys: string[]): Counts {
  return keys.reduce<Counts>(
    (acc, k) => {
      const ex = workouts[k]?.exercises ?? [];
      if (ex.length > 0) acc.sessions += 1;
      acc.exercises += ex.length;
      acc.sets += ex.reduce((s, e) => s + e.sets.length, 0);
      return acc;
    },
    { sessions: 0, sets: 0, exercises: 0 }
  );
}

const RING = 2 * Math.PI * 26;

function Ring({
  value,
  reference,
  label,
  sub,
  cls
}: {
  value: number;
  reference: number | null;
  label: string;
  sub: string;
  cls: string;
}) {
  const pct = reference && reference > 0 ? Math.min(1, value / reference) : 0;
  return (
    <div className={"ring-item " + cls}>
      <svg className="ring" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${value}`}>
        <circle className="ring-track" cx="32" cy="32" r="26" />
        <circle
          className="ring-fill"
          cx="32"
          cy="32"
          r="26"
          style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - pct) }}
        />
        <text className="ring-value" x="32" y="36" textAnchor="middle">
          {value}
        </text>
      </svg>
      <span className="ring-label">{label}</span>
      <span className="ring-sub">{sub}</span>
    </div>
  );
}

export function WeeklyWorkoutsWidget() {
  const workouts = useAppStore((s) => s.workouts);
  const goal = useAppStore((s) => s.workoutGoal);

  const back = (new Date().getDay() + 6) % 7;
  const weekKeys = Array.from({ length: back + 1 }, (_, i) => todayKey(i - back));
  const week = countRange(workouts, weekKeys);

  // The four full weeks before this one, averaged. Fewer than one full
  // week of history gives no reference, and the rings say so.
  const priorWeeks = [1, 2, 3, 4].map((w) =>
    countRange(
      workouts,
      Array.from({ length: 7 }, (_, i) => todayKey(i - back - 7 * w))
    )
  );
  const withData = priorWeeks.filter((w) => w.sessions > 0);
  const avg = (pick: (c: Counts) => number) =>
    withData.length ? withData.reduce((s, w) => s + pick(w), 0) / withData.length : null;

  const avgSets = avg((c) => c.sets);
  const avgExercises = avg((c) => c.exercises);
  const fmt = (n: number | null) => (n == null ? "sin historial" : `media ${Math.round(n)}`);

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Entreno semanal</span>
      </div>
      <div className="ring-row">
        <Ring
          value={week.sessions}
          reference={goal.weeklySessions}
          label="Sesiones"
          sub={`de ${goal.weeklySessions}`}
          cls="is-sessions"
        />
        <Ring value={week.sets} reference={avgSets} label="Series" sub={fmt(avgSets)} cls="is-sets" />
        <Ring
          value={week.exercises}
          reference={avgExercises}
          label="Ejercicios"
          sub={fmt(avgExercises)}
          cls="is-exercises"
        />
      </div>
    </div>
  );
}
