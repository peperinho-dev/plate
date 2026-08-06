// The running-timer screen — ported from #timerRunModal in app.js.
//
// A progress ring rather than a bare number: mid-plank you want to read
// remaining time at a glance without focusing on digits. The 5s lead-in
// exists so you can put the phone down and get into position before the
// first interval starts counting.
import { Modal } from "../../../shared/components/Modal";
import { formatDuration } from "../../../shared/lib/workouts";
import { TIMER_RING_CIRCUMFERENCE, type useTimerRun } from "../useTimerRun";

type Run = ReturnType<typeof useTimerRun>;

export function TimerRunModal({ run }: { run: Run }) {
  const { timer, phase, index, remaining, paused, flash, currentInterval, nextInterval, progress } = run;

  // Closing clears the timer, so there is nothing to animate out — same as
  // the vanilla sheet, which also just hid itself.
  if (!timer) return null;

  const done = phase === "done";
  const stepLabel = done
    ? `${timer.intervals.length} de ${timer.intervals.length}`
    : phase === "countdown"
      ? "Preparando"
      : `Paso ${index + 1} de ${timer.intervals.length}`;

  const centreName = done ? "¡Hecho!" : phase === "countdown" ? timer.intervals[0].name : (currentInterval?.name ?? "—");

  const nextLine = done
    ? `Total: ${formatDuration(timer.intervals.reduce((sum, iv) => sum + iv.seconds, 0))}`
    : phase === "countdown"
      ? "Prepárate…"
      : nextInterval
        ? `Después: ${nextInterval.name} · ${formatDuration(nextInterval.seconds)}`
        : "Último paso";

  const dashoffset = done ? 0 : TIMER_RING_CIRCUMFERENCE * (1 - progress);

  return (
    <Modal open title={timer.name} onClose={run.stop}>
      <div className="timer-run">
        <div className="timer-run-step">{stepLabel}</div>
        {/* key={flash} remounts the wrapper so the flash keyframe restarts
            on every interval change — the CSS-only way to replay it. */}
        <div className="timer-run-ring-wrap timer-run-flash" key={flash}>
          <svg className="timer-run-ring" viewBox="0 0 200 200">
            <circle className="timer-run-ring-track" cx="100" cy="100" r="90" />
            <circle
              className={
                "timer-run-ring-progress" +
                (timer.category === "stretch" ? " timer-run-ring-progress--stretch" : "")
              }
              cx="100"
              cy="100"
              r="90"
              style={{
                strokeDasharray: TIMER_RING_CIRCUMFERENCE,
                strokeDashoffset: dashoffset
              }}
            />
          </svg>
          <div className="timer-run-center">
            <div className="timer-run-time">{done ? "0:00" : formatDuration(remaining)}</div>
            <div className="timer-run-name">{centreName}</div>
          </div>
        </div>
        <p className="timer-run-next">{nextLine}</p>
        <div className={"timer-run-controls" + (done ? " is-complete" : "")}>
          <button
            type="button"
            className="timer-run-btn timer-run-btn--secondary timer-run-btn--stop"
            onClick={run.stop}
          >
            Detener
          </button>
          <button
            type="button"
            className="timer-run-btn timer-run-btn--primary timer-run-btn--pause"
            onClick={run.togglePause}
          >
            {paused ? "Reanudar" : "Pausar"}
          </button>
          <button
            type="button"
            className="timer-run-btn timer-run-btn--secondary timer-run-btn--skip"
            onClick={run.skip}
          >
            Saltar
          </button>
        </div>
      </div>
    </Modal>
  );
}
