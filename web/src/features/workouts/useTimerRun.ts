// Runs a multi-interval timer, ported from the timer-run block in app.js.
//
// The countdown value lives in a ref rather than state, and the interval
// callback reads and writes it directly. Doing the "did we hit zero" check
// inside a setState updater would put side effects (the beep, the log
// write) somewhere React is free to invoke twice while checking updater
// purity — which is exactly what double-logged the old rest timer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerPreset } from "../../shared/store/types";
import { playBeep, unlockBeep } from "./beep";

export const TIMER_COUNTDOWN_SECONDS = 5;
export const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 90;

/**
 * "ready" is the timer on screen but not yet counting.
 *
 * Tapping a warm-up used to start it immediately, so choosing which one to
 * do and committing to doing it were the same gesture — and the 5s lead-in
 * was the only thing standing between a mis-tap and a running clock. Now
 * the tap shows what you picked and waits for "Empezar".
 */
export type RunPhase = "idle" | "ready" | "countdown" | "active" | "done";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export function useTimerRun(onFinished: (timer: TimerPreset) => void) {
  const [timer, setTimer] = useState<TimerPreset | null>(null);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(0);

  const remainingRef = useRef(0);
  // When the current step is due to end, as a wall-clock timestamp. The
  // countdown used to be a count of setInterval ticks, which assumes the
  // ticks arrive — and on a phone they don't: iOS throttles timers in a
  // dimmed or backgrounded page and suspends them outright when the
  // screen locks. A step of 60s that you put the phone down for simply
  // stopped, showing the same number when you picked it up and never
  // advancing. Time is read from the clock now, so a page that was frozen
  // catches up the instant it runs again.
  const deadlineRef = useRef(0);
  /** Milliseconds left when paused, so resuming doesn't lose them. */
  const pausedLeftRef = useRef(0);
  const indexRef = useRef(0);
  const phaseRef = useRef<RunPhase>("idle");
  const pausedRef = useRef(false);
  const timerRef = useRef<TimerPreset | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const stopTicking = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = undefined;
  }, []);

  const stop = useCallback(() => {
    stopTicking();
    releaseWakeLock();
    phaseRef.current = "idle";
    setPhase("idle");
    setTimer(null);
    timerRef.current = null;
    setPaused(false);
  }, [releaseWakeLock, stopTicking]);

  // Guarded, because the clock must never be able to stop. `remaining`
  // comes from stored data, and a step whose seconds was missing put NaN
  // in here: NaN - 1 is NaN, NaN <= 0 is false, so the countdown neither
  // ticked down nor advanced and the run was stuck until you skipped the
  // step by hand. Migration now cleans the data; this makes the runner
  // itself incapable of that state whatever it is handed.
  const setRemainingBoth = (v: number) => {
    const safe = Number.isFinite(v) ? v : 0;
    remainingRef.current = safe;
    setRemaining(safe);
  };
  const setIndexBoth = (v: number) => {
    indexRef.current = v;
    setIndex(v);
  };
  const setPhaseBoth = (v: RunPhase) => {
    phaseRef.current = v;
    setPhase(v);
  };

  /** Starts a stretch of `seconds`, due `overshootMs` ago at the earliest. */
  const beginStep = (seconds: number, overshootMs = 0) => {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    deadlineRef.current = Date.now() + safe * 1000 - overshootMs;
    setRemainingBoth(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
  };

  const finish = useCallback(() => {
    stopTicking();
    releaseWakeLock();
    setPhaseBoth("done");
    if (timerRef.current) finishedRef.current(timerRef.current);
  }, [releaseWakeLock, stopTicking]);

  /**
   * Moves to `from`, then walks forward through any steps whose time has
   * already passed.
   *
   * The walk is what makes a suspended page recoverable: come back after
   * three minutes and the timer lands where it should be rather than
   * resuming a step that ended long ago. It beeps once, for the step you
   * actually land on — five beeps for five steps you missed would be
   * noise about time you weren't there for.
   */
  const landOn = useCallback(
    (from: number, overshootMs: number) => {
      const t = timerRef.current;
      if (!t) return;
      let i = from;
      let left = Math.max(0, overshootMs);
      while (i < t.intervals.length) {
        const ms = (t.intervals[i]?.seconds ?? 0) * 1000;
        if (left < ms) break;
        left -= ms;
        i += 1;
      }
      if (i >= t.intervals.length) {
        finish();
        return;
      }
      setPhaseBoth("active");
      setIndexBoth(i);
      beginStep(t.intervals[i].seconds, left);
      setFlash((f) => f + 1);
      playBeep();
    },
    [finish]
  );

  const advance = useCallback(
    (overshootMs = 0) => landOn(indexRef.current + 1, overshootMs),
    [landOn]
  );

  const startFirstInterval = useCallback(
    (overshootMs = 0) => landOn(0, overshootMs),
    [landOn]
  );

  const tick = useCallback(() => {
    const msLeft = deadlineRef.current - Date.now();
    if (msLeft > 0) {
      setRemainingBoth(Math.ceil(msLeft / 1000));
      return;
    }
    if (phaseRef.current === "countdown") startFirstInterval(-msLeft);
    else advance(-msLeft);
  }, [advance, startFirstInterval]);

  const startTicking = useCallback(() => {
    stopTicking();
    tickRef.current = setInterval(tick, 250);
  }, [stopTicking, tick]);

  /** Puts a timer on screen without running it. */
  const arm = useCallback((preset: TimerPreset) => {
    if (preset.intervals.length === 0) return;
    timerRef.current = preset;
    setTimer(preset);
    setPaused(false);
    pausedRef.current = false;
    setPhaseBoth("ready");
    setIndexBoth(0);
    setRemainingBoth(preset.intervals[0].seconds);
    deadlineRef.current = 0;
  }, []);

  const start = useCallback(
    (preset?: TimerPreset) => {
      const chosen = preset ?? timerRef.current;
      if (!chosen || chosen.intervals.length === 0) return;
      // Must happen synchronously inside the triggering tap: iOS only
      // allows playback that traces back to a gesture, and every beep that
      // matters fires later from a timer callback. Also confirms the tap.
      unlockBeep();
      timerRef.current = chosen;
      setTimer(chosen);
      setPaused(false);
      pausedRef.current = false;
      setPhaseBoth("countdown");
      setIndexBoth(0);
      beginStep(TIMER_COUNTDOWN_SECONDS);
      startTicking();
      // Best-effort: a mobility routine is useless if the screen sleeps
      // halfway through, but the API is not everywhere.
      navigator.wakeLock
        ?.request("screen")
        .then((s) => {
          wakeLockRef.current = s;
        })
        .catch(() => {});
    },
    [startTicking]
  );

  // The side effects live out here rather than inside a setState updater:
  // React is free to run an updater more than once while checking it is
  // pure, and pausing twice is how a clock ends up neither stopped nor
  // running. Pausing banks the milliseconds left; resuming re-dates the
  // deadline from now, so no time is lost or gained either way.
  const togglePause = useCallback(() => {
    setPaused((wasPaused) => {
      if (wasPaused) {
        deadlineRef.current = Date.now() + pausedLeftRef.current;
        startTicking();
      } else {
        pausedLeftRef.current = Math.max(0, deadlineRef.current - Date.now());
        stopTicking();
      }
      pausedRef.current = !wasPaused;
      return !wasPaused;
    });
  }, [startTicking, stopTicking]);

  const skip = useCallback(() => {
    if (phaseRef.current === "countdown") startFirstInterval(0);
    else advance(0);
  }, [advance, startFirstInterval]);

  useEffect(
    () => () => {
      clearInterval(tickRef.current);
      wakeLockRef.current?.release().catch(() => {});
    },
    []
  );

  // Coming back to the foreground re-reads the clock at once instead of
  // waiting for the next tick, and re-takes the wake lock, which iOS drops
  // whenever the page is hidden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const running = phaseRef.current === "countdown" || phaseRef.current === "active";
      if (!running || pausedRef.current) return;
      tick();
      navigator.wakeLock
        ?.request("screen")
        .then((s) => {
          wakeLockRef.current = s;
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tick]);

  const currentInterval = timer && phase === "active" ? timer.intervals[index] : null;
  const nextInterval = timer && phase === "active" ? timer.intervals[index + 1] : null;
  // How long the ring has to fill. The ring is driven by a single CSS
  // animation spanning the whole step rather than by per-tick updates:
  // stepping a transition once a second meant it animated for 0.9s then
  // sat still for 0.1s, which read as a stutter every second, and any
  // jitter in the interval timing showed up directly in the motion.
  const ringSeconds = phase === "countdown" ? TIMER_COUNTDOWN_SECONDS : (currentInterval?.seconds ?? 0);

  return {
    timer,
    phase,
    index,
    remaining,
    paused,
    flash,
    currentInterval,
    nextInterval,
    ringSeconds,
    arm,
    start,
    stop,
    togglePause,
    skip
  };
}
