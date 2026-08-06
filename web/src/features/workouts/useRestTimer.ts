// Rest countdown between sets, ported from the rest-timer block in app.js.
//
// The beep is generated with WebAudio rather than an audio file so nothing
// extra has to be fetched or precached. iOS only allows audio that traces
// back to a user gesture, so the context is primed when the timer starts
// (a tap) — otherwise the beep at zero, fired from a timeout, is silently
// blocked.
import { useCallback, useEffect, useRef, useState } from "react";

let audioCtx: AudioContext | null = null;

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

export function useRestTimer(onFinished?: () => void) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  // The countdown is tracked in a ref, not read back out of state.
  //
  // Doing the completion check inside a setState updater would put a side
  // effect (the beep, and the caller's onFinished) somewhere React is free
  // to invoke twice while checking that updaters are pure — which double-
  // logged every finished timer.
  const remainingRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = undefined;
    remainingRef.current = null;
    setRemaining(null);
  }, []);

  const start = useCallback((seconds: number) => {
    ensureAudioContext(); // must happen inside the triggering gesture
    clearInterval(intervalRef.current);
    remainingRef.current = seconds;
    setRemaining(seconds);
    intervalRef.current = setInterval(() => {
      const next = (remainingRef.current ?? 0) - 1;
      if (next <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
        remainingRef.current = null;
        setRemaining(null);
        playBeep();
        finishedRef.current?.();
        return;
      }
      remainingRef.current = next;
      setRemaining(next);
    }, 1000);
  }, []);

  // Never leave an interval running after the sheet closes.
  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { remaining, start, stop, isRunning: remaining !== null };
}
