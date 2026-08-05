// Transient confirmation toast, ported from showToast() in app.js
// (2.6s, replaces any in-flight message rather than queueing).
//
// Exposed as a plain showToast(msg) function, not a hook, so non-component
// code (store actions, event handlers) can call it exactly like the
// vanilla version did.
//
// The optional action is what makes swipe-to-delete safe: a swipe is much
// easier to trigger by accident than the explicit "x" button it replaces,
// so the delete is always paired with an undo.
import { useEffect, useState } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastPayload {
  msg: string;
  action?: ToastAction;
}

type Listener = (payload: ToastPayload | null) => void;

const TOAST_MS = 2600;
// Undo needs a longer read-and-react window than a plain confirmation.
const TOAST_ACTION_MS = 5000;

let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string, action?: ToastAction) {
  listener?.({ msg, action });
  clearTimeout(timer);
  timer = setTimeout(() => listener?.(null), action ? TOAST_ACTION_MS : TOAST_MS);
}

export function hideToast() {
  clearTimeout(timer);
  listener?.(null);
}

export function Toast() {
  const [payload, setPayload] = useState<ToastPayload | null>(null);

  useEffect(() => {
    listener = setPayload;
    return () => {
      listener = null;
      clearTimeout(timer);
    };
  }, []);

  if (!payload) return null;

  // Keyed so re-showing a toast restarts the CSS entry animation instead
  // of silently swapping the text in place.
  return (
    <div className="toast" key={payload.msg}>
      {payload.msg}
      {payload.action && (
        <button
          type="button"
          onClick={() => {
            payload.action!.onClick();
            hideToast();
          }}
          style={{
            marginLeft: 12,
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontWeight: 800,
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer"
          }}
        >
          {payload.action.label}
        </button>
      )}
    </div>
  );
}
