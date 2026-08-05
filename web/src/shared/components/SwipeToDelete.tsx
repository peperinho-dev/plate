// Swipe-left-to-delete wrapper for list rows.
//
// dragDirectionLock is the important bit: it makes Motion commit to one
// axis per gesture, so a vertical scroll through the log never turns into
// a half-swipe, and a deliberate horizontal swipe doesn't fight the page.
// Dragging is clamped to the left because there's no right-hand action.
import type { ReactNode } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";

interface SwipeToDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  /** Disabled while picking rows — a swipe would fight the tap-to-select. */
  disabled?: boolean;
}

// How far left the row must be released to count as a delete.
const DELETE_THRESHOLD = -96;

export function SwipeToDelete({ children, onDelete, disabled }: SwipeToDeleteProps) {
  const x = useMotionValue(0);
  // The backdrop deepens as the row travels, so the row itself signals
  // when the gesture has gone far enough to commit.
  const bgOpacity = useTransform(x, [DELETE_THRESHOLD, 0], [1, 0.25]);

  if (disabled) return <>{children}</>;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--danger)",
          opacity: bgOpacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 18,
          color: "#fff",
          fontSize: 13,
          fontWeight: 700
        }}
      >
        Quitar
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        style={{ x, position: "relative", background: "var(--surface)" }}
        dragConstraints={{ left: DELETE_THRESHOLD, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x <= DELETE_THRESHOLD) onDelete();
          // Not snapping back on a delete would leave the row visibly
          // offset for the frame before it unmounts.
          x.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
