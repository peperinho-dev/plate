// Export / import of the whole dataset.
//
// This is the only way data leaves the device, and — because the app is
// local-only with no sync — the only protection against losing everything
// if the home-screen icon is deleted (iOS wipes all origin storage with
// it) or the browser clears site data.
import { useAppStore } from "../../shared/store";
import { migrateData } from "../../shared/store/schema";
import { todayKey } from "../../shared/lib/date";
import { showToast } from "../../shared/components/Toast";

// A week without an export is the point at which the reminder appears.
export const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function hasBackupWorthyData(): boolean {
  const s = useAppStore.getState();
  return (
    s.weightLog.length > 0 ||
    Object.values(s.days).some((d) => d.entries.length > 0) ||
    Object.keys(s.workouts).length > 0
  );
}

export function isBackupOverdue(): boolean {
  const s = useAppStore.getState();
  return Date.now() - (s.lastExportedAt || 0) > BACKUP_REMINDER_INTERVAL_MS;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Prefers the native share sheet, which on iOS is the only route to
// "Save to Files" / AirDrop / sending it to yourself — a plain download
// there tends to vanish into a place people can't find again.
export async function exportData() {
  const state = useAppStore.getState();
  const filename = `plate-backup-${todayKey(0)}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const file = typeof File !== "undefined" ? new File([blob], filename, { type: "application/json" }) : null;

  // Feature-detected off the object rather than by truthiness: TypeScript
  // types both as always-present, but older browsers genuinely lack them.
  const hasShare = "share" in navigator && "canShare" in navigator;
  const canShareFile = !!(file && hasShare && navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({ files: [file!], title: "Copia de seguridad de Plate" });
    } catch (err) {
      // Cancelling the share sheet is not a failure and must not fall
      // through to a surprise download.
      if ((err as { name?: string })?.name === "AbortError") return;
      downloadBlob(blob, filename);
    }
  } else {
    downloadBlob(blob, filename);
  }

  useAppStore.setState({ lastExportedAt: Date.now() });
  showToast("Datos exportados");
}

// Replaces everything. The caller is responsible for confirming first —
// this is destructive and cannot be undone.
export function importData(rawJson: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    showToast("Archivo no válido");
    return false;
  }
  // Runs through the same migration path as normal loading, so an older
  // backup is brought forward rather than rejected.
  useAppStore.setState(migrateData(parsed), true);
  showToast("Datos importados");
  return true;
}
