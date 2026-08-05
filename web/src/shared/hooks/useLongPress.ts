// Press-and-hold detection.
//
// Pointer Events rather than touch/mouse pairs, so one implementation
// covers finger, stylus and mouse. The timer is cancelled as soon as the
// pointer travels past a small tolerance, which is what keeps a long-press
// from firing during a scroll or a horizontal swipe — the two gestures
// share the same rows.
import { useCallback, useRef } from "react";

interface Options {
  /** How long the press must be held. 500ms matches the iOS convention. */
  delay?: number;
  /** Movement (px) that cancels the press — enough to absorb finger jitter. */
  moveTolerance?: number;
}

export function useLongPress(onLongPress: () => void, { delay = 500, moveTolerance = 10 }: Options = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore secondary buttons; a right-click isn't a long press.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > moveTolerance || dy > moveTolerance) clear();
    },
    [clear, moveTolerance]
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear
    },
    /**
     * True when the press just fired — let the click handler check this to
     * suppress the tap that the browser sends on pointer release.
     */
    didFire: () => firedRef.current
  };
}
