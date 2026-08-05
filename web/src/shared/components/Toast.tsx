// Transient confirmation toast, ported from showToast() in app.js
// (2.6s, replaces any in-flight message rather than queueing).
//
// Exposed as a plain showToast(msg) function, not a hook, so non-component
// code (store actions, event handlers) can call it exactly like the
// vanilla version did.
import { useEffect, useState } from "react";

type Listener = (msg: string | null) => void;

const TOAST_MS = 2600;
let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string) {
  listener?.(msg);
  clearTimeout(timer);
  timer = setTimeout(() => listener?.(null), TOAST_MS);
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listener = setMsg;
    return () => {
      listener = null;
      clearTimeout(timer);
    };
  }, []);

  if (!msg) return null;
  // Keyed so re-showing a toast restarts the CSS entry animation instead
  // of silently swapping the text in place.
  return (
    <div className="toast" key={msg}>
      {msg}
    </div>
  );
}
