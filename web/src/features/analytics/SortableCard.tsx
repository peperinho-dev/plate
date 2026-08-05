// A reorderable Analytics card.
//
// Dragging is bound to a dedicated handle rather than the whole card, so
// the card's own contents stay tappable and scrollable. That separation is
// also what keeps dnd-kit's pointer sensor from competing with the
// long-press and swipe gestures used elsewhere in the app.
import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableCardProps {
  id: string;
  title: string;
  editing: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  children: ReactNode;
}

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function SortableCard({ id, title, editing, hidden, onToggleHidden, children }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged card above its neighbours while it moves.
    zIndex: isDragging ? 2 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
    opacity: hidden && editing ? 0.4 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="card">
      <div className="card-date-row">
        <div className="card-date">{title}</div>
        {editing && (
          <div className="card-date-actions">
            <button type="button" className="link-btn link-btn--muted" onClick={onToggleHidden}>
              {hidden ? "Mostrar" : "Ocultar"}
            </button>
            <button
              type="button"
              className="link-btn"
              aria-label="Reordenar"
              style={{ cursor: "grab", touchAction: "none", display: "flex", alignItems: "center" }}
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
