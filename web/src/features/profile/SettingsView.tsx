// Ajustes as a real tab rather than a gear buried in the food log's
// top bar. Everything that isn't logging lives here: who you are, what
// you're aiming at, your weight history, and your backup.
//
// The sheets themselves are unchanged — this is the index that reaches
// them, so each stays a focused surface instead of one long settings
// page.
import { useEffect, useState } from "react";
import { ChevronRight } from "../../shared/components/Icons";
import { useAppStore } from "../../shared/store";
import { useUiStore } from "../../shared/store/ui";
import { latestWeightEntry } from "../../shared/lib/targets";
import { ProfileModal } from "./ProfileModal";
import { WeightModal } from "./WeightModal";
import { TargetModal } from "./TargetModal";
import { WorkoutSettingsModal } from "./WorkoutSettingsModal";
import { BackupModal } from "./BackupModal";
import { PhotosModal } from "../photos/PhotosModal";

export function SettingsView() {
  const profile = useAppStore((s) => s.profile);
  const calorieTarget = useAppStore((s) => s.calorieTarget);
  const weightLog = useAppStore((s) => s.weightLog);
  const lastExportedAt = useAppStore((s) => s.lastExportedAt);
  const workoutGoal = useAppStore((s) => s.workoutGoal);

  const [profileOpen, setProfileOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

  // The food log's kcal chip and the central + both route here rather
  // than owning their own copies of these sheets.
  const pendingAction = useUiStore((s) => s.pendingAction);
  const clearAction = useUiStore((s) => s.clearAction);
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === "weight") setWeightOpen(true);
    else if (pendingAction === "profile") setProfileOpen(true);
    else if (pendingAction === "target") setTargetOpen(true);
    else if (pendingAction === "photo") setPhotosOpen(true);
    else return;
    clearAction();
  }, [pendingAction, clearAction]);

  const latest = latestWeightEntry(weightLog);
  const profileDone = !!(profile.sex && profile.age && profile.heightCm && profile.activityLevel);

  // Grouped rather than one flat list: what the app knows about you, what
  // it counts, and the data itself are three different questions, and the
  // flat list had them interleaved.
  const groups: { title: string; rows: { label: string; hint: string; onClick: () => void }[] }[] = [
    {
      title: "Tú",
      rows: [
        {
          label: "Perfil",
          hint: profileDone ? "Sexo, edad, altura, objetivo" : "Sin completar",
          onClick: () => setProfileOpen(true)
        },
        {
          label: "Registro de peso",
          hint: latest ? `${latest.weightKg.toFixed(1)} kg · ${latest.date}` : "Sin registros",
          onClick: () => setWeightOpen(true)
        },
        {
          label: "Fotos de progreso",
          hint: "Solo en este dispositivo",
          onClick: () => setPhotosOpen(true)
        }
      ]
    },
    {
      title: "Objetivos",
      rows: [
        {
          label: "Meta diaria",
          hint: `${calorieTarget.min}–${calorieTarget.max} kcal · ${
            calorieTarget.mode === "calculated" ? "calculada" : "a mano"
          }`,
          onClick: () => setTargetOpen(true)
        },
        {
          label: "Entreno",
          hint: `${workoutGoal.weeklySessions} ${
            workoutGoal.weeklySessions === 1 ? "sesión" : "sesiones"
          }/semana · descanso ${workoutGoal.restSeconds}s`,
          onClick: () => setWorkoutOpen(true)
        }
      ]
    },
    {
      title: "Datos",
      rows: [
        {
          label: "Copia de seguridad",
          hint: lastExportedAt
            ? `Última: ${new Date(lastExportedAt).toLocaleDateString("es-ES")}`
            : "Nunca exportado",
          onClick: () => setBackupOpen(true)
        }
      ]
    }
  ];

  return (
    <div className="view">
      <header className="topbar">
        <span className="day-label">Ajustes</span>
      </header>

      <main className="content">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="section-head">
              <span className="section-title">{group.title}</span>
            </div>
            <div className="card">
              <div className="log-list">
                {group.rows.map((r) => (
                  <div className="row" key={r.label}>
                    <button type="button" className="row-main" onClick={r.onClick}>
                      <span className="row-name">{r.label}</span>
                      <span className="row-qty">{r.hint}</span>
                    </button>
                    <span className="row-chevron">
                      <ChevronRight />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </main>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenWeight={() => {
          setProfileOpen(false);
          setWeightOpen(true);
        }}
      />
      <WeightModal
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        onBack={() => {
          setWeightOpen(false);
          setProfileOpen(true);
        }}
      />
      <TargetModal open={targetOpen} onClose={() => setTargetOpen(false)} />
      <WorkoutSettingsModal open={workoutOpen} onClose={() => setWorkoutOpen(false)} />
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      <PhotosModal open={photosOpen} onClose={() => setPhotosOpen(false)} />
    </div>
  );
}
