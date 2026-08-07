// Rest countdown between sets, ported from the rest-timer block in app.js.
//
// Shares the timer beep (see beep.ts — an <audio> element, so the iOS
// silent switch doesn't mute it). Primed on the tap that starts the rest,
// since the beep at zero fires from a timeout with no gesture behind it.
import { useCallback, useEffect, useRef, useState } from "react";
import { playBeep, unlockBeep } from "./beep";

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
    unlockBeep(); // must happen inside the triggering gesture
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
