// Nudge to export when there's real data and no recent backup.
//
// Worth the screen space because the failure mode is total: deleting the
// home-screen icon on iOS wipes all origin storage, and there's no sync to
// recover from. Dismissal is per-session only — it should come back.
import { useState } from "react";
import { useAppStore } from "../../shared/store";
import { exportData, hasBackupWorthyData, isBackupOverdue } from "./dataTransfer";

export function BackupBanner() {
  const [dismissed, setDismissed] = useState(false);
  // Subscribed so the banner disappears the moment an export happens.
  useAppStore((s) => s.lastExportedAt);
  useAppStore((s) => s.days);

  if (dismissed || !isBackupOverdue() || !hasBackupWorthyData()) return null;

  return (
    <div className="adaptive-banner">
      <p>Sin copia reciente — expórtala para no perder tus datos.</p>
      <div className="adaptive-banner-actions">
        <button type="button" className="link-btn" onClick={() => void exportData()}>
          Exportar ahora
        </button>
        <button type="button" className="link-btn link-btn--muted" onClick={() => setDismissed(true)}>
          Ahora no
        </button>
      </div>
    </div>
  );
}
