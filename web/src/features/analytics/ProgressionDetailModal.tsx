// Variants within one progression group, oldest-first — the timeline of
// how a movement got harder over time. Ported from openProgressionDetail()
// in app.js.
import { Modal } from "../../shared/components/Modal";
import { formatShortDate } from "../../shared/lib/format";
import { formatSet } from "../../shared/lib/workouts";
import type { Variant } from "./progressions";

interface ProgressionDetailModalProps {
  open: boolean;
  groupName: string | null;
  variants: Variant[];
  onClose: () => void;
}

export function ProgressionDetailModal({
  open,
  groupName,
  variants,
  onClose
}: ProgressionDetailModalProps) {
  return (
    <Modal open={open} title={groupName ?? "Progresión"} onClose={onClose}>
      <div className="log-list">
        {variants.map((v) => (
          <div className="row" key={v.name}>
            <div className="row-main">
              <span className="row-name">{v.name}</span>
              <span className="row-qty">
                {formatShortDate(v.firstDate)} – {formatShortDate(v.lastDate)} · {v.sessionCount}{" "}
                {v.sessionCount === 1 ? "sesión" : "sesiones"}
              </span>
            </div>
            <span className="row-amount">{v.bestSet ? formatSet(v.bestSet) : "—"}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
