// Counts the daily total up/down when it changes, restoring the behaviour
// setTotalKcalText() had in the vanilla app.
//
// It deliberately snaps instead of animating when `resetKey` changes (the
// day being viewed): a count-up while paging between days reads as
// sluggish, whereas one after logging food reads as responsive. Motion's
// animate() also respects prefers-reduced-motion via its reduced-motion
// support, so this stays comfortable for users who ask for less movement.
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  /** Change this to snap rather than animate (e.g. the visible day). */
  resetKey?: string;
  duration?: number;
}

export function AnimatedNumber({ value, resetKey, duration = 0.45 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(Math.round(value));
  const prevValue = useRef(value);
  const prevKey = useRef(resetKey);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const changedDay = prevKey.current !== resetKey;
    prevKey.current = resetKey;

    if (changedDay || reduceMotion) {
      prevValue.current = value;
      setDisplay(Math.round(value));
      return;
    }

    const controls = animate(prevValue.current, value, {
      duration,
      ease: [0, 0, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v))
    });
    prevValue.current = value;
    return () => controls.stop();
  }, [value, resetKey, duration, reduceMotion]);

  return <>{display}</>;
}
