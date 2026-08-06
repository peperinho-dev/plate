// Runs a multi-interval timer, ported from the timer-run block in app.js.
//
// The countdown value lives in a ref rather than state, and the interval
// callback reads and writes it directly. Doing the "did we hit zero" check
// inside a setState updater would put side effects (the beep, the log
// write) somewhere React is free to invoke twice while checking updater
// purity — which is exactly what double-logged the old rest timer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerPreset } from "../../shared/store/types";

export const TIMER_COUNTDOWN_SECONDS = 5;
export const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 90;

let audioCtx: AudioContext | null = null;

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx?.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playBeep() {
  const ctx = audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.42);
}

export type RunPhase = "idle" | "countdown" | "active" | "done";

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
  const indexRef = useRef(0);
  const phaseRef = useRef<RunPhase>("idle");
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

  const setRemainingBoth = (v: number) => {
    remainingRef.current = v;
    setRemaining(v);
  };
  const setIndexBoth = (v: number) => {
    indexRef.current = v;
    setIndex(v);
  };
  const setPhaseBoth = (v: RunPhase) => {
    phaseRef.current = v;
    setPhase(v);
  };

  const finish = useCallback(() => {
    stopTicking();
    releaseWakeLock();
    setPhaseBoth("done");
    if (timerRef.current) finishedRef.current(timerRef.current);
  }, [releaseWakeLock, stopTicking]);

  const advance = useCallback(() => {
    const t = timerRef.current;
    if (!t) return;
    const next = indexRef.current + 1;
    if (next >= t.intervals.length) {
      finish();
      return;
    }
    setIndexBoth(next);
    setRemainingBoth(t.intervals[next].seconds);
    setFlash((f) => f + 1);
    playBeep();
  }, [finish]);

  const startFirstInterval = useCallback(() => {
    const t = timerRef.current;
    if (!t) return;
    setPhaseBoth("active");
    setIndexBoth(0);
    setRemainingBoth(t.intervals[0].seconds);
    setFlash((f) => f + 1);
    playBeep();
  }, []);

  const tick = useCallback(() => {
    const next = remainingRef.current - 1;
    if (next <= 0) {
      if (phaseRef.current === "countdown") startFirstInterval();
      else advance();
      return;
    }
    setRemainingBoth(next);
  }, [advance, startFirstInterval]);

  const startTicking = useCallback(() => {
    stopTicking();
    tickRef.current = setInterval(tick, 1000);
  }, [stopTicking, tick]);

  const start = useCallback(
    (preset: TimerPreset) => {
      if (preset.intervals.length === 0) return;
      ensureAudioContext(); // must happen inside the triggering gesture
      timerRef.current = preset;
      setTimer(preset);
      setPaused(false);
      setPhaseBoth("countdown");
      setIndexBoth(0);
      setRemainingBoth(TIMER_COUNTDOWN_SECONDS);
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

  const togglePause = useCallback(() => {
    setPaused((p) => {
      if (p) startTicking();
      else stopTicking();
      return !p;
    });
  }, [startTicking, stopTicking]);

  const skip = useCallback(() => {
    if (phaseRef.current === "countdown") startFirstInterval();
    else advance();
  }, [advance, startFirstInterval]);

  useEffect(
    () => () => {
      clearInterval(tickRef.current);
      wakeLockRef.current?.release().catch(() => {});
    },
    []
  );

  const currentInterval = timer && phase === "active" ? timer.intervals[index] : null;
  const nextInterval = timer && phase === "active" ? timer.intervals[index + 1] : null;
  const total = phase === "countdown" ? TIMER_COUNTDOWN_SECONDS : (currentInterval?.seconds ?? 1);
  const progress = total > 0 ? (total - remaining) / total : 0;

  return {
    timer,
    phase,
    index,
    remaining,
    paused,
    flash,
    currentInterval,
    nextInterval,
    progress,
    start,
    stop,
    togglePause,
    skip
  };
}
