// "Resumen del entreno" — what the session amounted to.
//
// Modelled on the reference app's workout-complete screen: the headline
// numbers, any records the session set, then a breakdown per exercise
// with what each one did against last time. Their version is reached by
// finishing a workout; this app has no session to finish, so it hangs off
// the day's totals — the same gesture that opens the nutrition overview
// from the food log's totals.
import { Modal } from "../../../shared/components/Modal";
import { useAppStore } from "../../../shared/store";
import { formatDuration, formatSet } from "../../../shared/lib/workouts";
import { summarizeSession } from "../sessionSummary";
import { bodyweightOn } from "../../../shared/lib/bodyweight";

interface SessionSummaryModalProps {
  open: boolean;
  dayKey: string;
  onClose: () => void;
}

function Delta({ now, before, unit }: { now: number; before: number | null; unit: string }) {
  if (before === null || before === 0) return null;
  const diff = now - before;
  if (Math.abs(diff) < 0.5) return <span className="ss-delta is-flat">igual</span>;
  return (
    <span className={"ss-delta " + (diff > 0 ? "is-up" : "is-down")}>
      {diff > 0 ? "+" : "−"}
      {Math.abs(Math.round(diff))} {unit}
    </span>
  );
}

export function SessionSummaryModal({ open, dayKey, onClose }: SessionSummaryModalProps) {
  const workouts = useAppStore((s) => s.workouts);
  const weightLog = useAppStore((s) => s.weightLog);
  // The weight on the day being summarised, not today's — same reason
  // as the day card it opens from.
  const bodyweightKg = bodyweightOn(weightLog, dayKey);
  const summary = summarizeSession(workouts, dayKey, bodyweightKg);

  return (
    <Modal open={open} title="Resumen del entreno" onClose={onClose}>
      {!summary ? (
        <p className="empty-state">Sin entreno este día.</p>
      ) : (
        <>
          <div className="ss-totals">
            <div className="ss-total">
              <span className="ss-total-value">{summary.totals.sets}</span>
              <span className="ss-total-label">series</span>
            </div>
            <div className="ss-total">
              <span className="ss-total-value">{Math.round(summary.totals.volume)}</span>
              <span className="ss-total-label">kg volumen</span>
            </div>
            <div className="ss-total">
              <span className="ss-total-value">{summary.exercises.length}</span>
              <span className="ss-total-label">ejercicios</span>
            </div>
            {summary.timerCount > 0 && (
              <div className="ss-total">
                <span className="ss-total-value">{formatDuration(summary.timerSeconds)}</span>
                <span className="ss-total-label">temporizadores</span>
              </div>
            )}
          </div>

          {/* Records first: it's the one thing in here you'd want to know
              without reading, and burying it under the breakdown would
              make you hunt for it. */}
          {summary.records.length > 0 && (
            <div className="ss-records">
              <span className="ss-section-title">Récords</span>
              {summary.records.map((r) => (
                <div className="ss-record" key={r.id}>
                  <span className="ss-record-name">{r.name}</span>
                  <span className="ss-record-set">{r.best ? formatSet(r.best) : "—"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ss-list">
            <span className="ss-section-title">Ejercicios</span>
            {summary.exercises.map((e) => (
              <div className="ss-row" key={e.id}>
                <div className="ss-row-head">
                  <span className="ss-row-name">
                    {e.name}
                    {e.isRecord && <span className="ss-badge">récord</span>}
                  </span>
                  <span className="ss-row-best">{e.best ? formatSet(e.best) : "—"}</span>
                </div>
                <div className="ss-row-meta">
                  <span>
                    {e.sets} {e.sets === 1 ? "serie" : "series"}
                  </span>
                  {e.volume > 0 && (
                    <>
                      <span className="ss-sep">·</span>
                      {/* Annotated the way the reference app does it -
                          "6580 lb volume (+279 lb BW)" - so a volume that
                          includes bodyweight says so instead of reading
                          as barbell tonnage. */}
                      <span>
                        {Math.round(e.volume)} kg
                        {e.bodyweightVolume > 0 && (
                          <span className="ss-bw"> (+{Math.round(e.bodyweightVolume)} pc)</span>
                        )}
                      </span>
                      <Delta now={e.volume} before={e.previousVolume} unit="kg" />
                    </>
                  )}
                  {e.volume === 0 && e.reps > 0 && (
                    <>
                      <span className="ss-sep">·</span>
                      <span>{e.reps} reps</span>
                    </>
                  )}
                  {e.holdSeconds > 0 && (
                    <>
                      <span className="ss-sep">·</span>
                      <span>{formatDuration(e.holdSeconds)}</span>
                    </>
                  )}
                </div>
                {e.previousBest && (
                  <span className="ss-row-prev">Antes: {formatSet(e.previousBest)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
