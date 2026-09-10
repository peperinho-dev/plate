// Progress photos: a gallery by date, and a two-up comparison.
//
// One photo per angle per day, as the reference app does — the constraint
// is what makes a comparison meaningful, since you're always comparing
// like with like.
//
// The photos never leave the device and are deliberately absent from the
// backup file. That's stated on screen rather than left to be discovered:
// an export that silently omitted them would be worse than no export.
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { showToast } from "../../shared/components/Toast";
import { XIcon, PlusIcon } from "../../shared/components/Icons";
import { formatShortDate } from "../../shared/lib/format";
import { todayKey } from "../../shared/lib/date";
import {
  ANGLES,
  deletePhoto,
  downscale,
  listPhotos,
  photoId,
  putPhoto,
  type PhotoAngle,
  type PhotoRecord
} from "./photoStore";

interface PhotosModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "gallery" | "compare";

export function PhotosModal({ open, onClose }: PhotosModalProps) {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("gallery");
  const [angle, setAngle] = useState<PhotoAngle>("front");
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [pending, setPending] = useState<PhotoAngle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    const all = await listPhotos();
    setPhotos(all);
  };

  useEffect(() => {
    if (open) void reload();
  }, [open]);

  // Object URLs are handles into memory, not values — they have to be
  // revoked or every reload leaks the last set.
  useEffect(() => {
    const next: Record<string, string> = {};
    photos.forEach((p) => {
      next[p.id] = URL.createObjectURL(p.blob);
    });
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const dates = [...new Set(photos.map((p) => p.date))];
  const ofAngle = photos.filter((p) => p.angle === angle);

  const handleFile = async (file: File) => {
    if (!pending) return;
    try {
      const { blob, width, height } = await downscale(file);
      const date = todayKey(0);
      await putPhoto({
        id: photoId(date, pending),
        date,
        angle: pending,
        blob,
        width,
        height,
        addedAt: Date.now()
      });
      await reload();
      showToast("Foto guardada");
    } catch {
      showToast("No se pudo leer la imagen");
    } finally {
      setPending(null);
    }
  };

  const before = photos.find((p) => p.id === beforeId);
  const after = photos.find((p) => p.id === afterId);

  return (
    <Modal open={open} title="Fotos de progreso" onClose={onClose}>
      <div className="segmented segmented--compact">
        <button
          type="button"
          className={"segmented-btn" + (mode === "gallery" ? " active" : "")}
          onClick={() => setMode("gallery")}
        >
          Galería
        </button>
        <button
          type="button"
          className={"segmented-btn" + (mode === "compare" ? " active" : "")}
          onClick={() => setMode("compare")}
        >
          Comparar
        </button>
      </div>

      {mode === "gallery" ? (
        <>
          <div className="photo-add-row">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                className="photo-add"
                onClick={() => {
                  setPending(a.id);
                  fileRef.current?.click();
                }}
              >
                <PlusIcon />
                <span>{a.label}</span>
              </button>
            ))}
          </div>

          {dates.length === 0 && (
            <p className="empty-state">
              Sin fotos todavía. Añade una de frente, perfil o espalda para empezar.
            </p>
          )}

          {dates.map((date) => (
            <div className="photo-day" key={date}>
              <span className="ss-section-title">{formatShortDate(date)}</span>
              <div className="photo-row">
                {ANGLES.map((a) => {
                  const p = photos.find((x) => x.date === date && x.angle === a.id);
                  if (!p) return <span className="photo-slot is-empty" key={a.id}>{a.label}</span>;
                  return (
                    <span className="photo-slot" key={a.id}>
                      <img src={urls[p.id]} alt={`${a.label} · ${formatShortDate(date)}`} />
                      <button
                        type="button"
                        className="row-del photo-del"
                        aria-label={`Quitar ${a.label} del ${formatShortDate(date)}`}
                        onClick={async () => {
                          await deletePhoto(p.id);
                          await reload();
                        }}
                      >
                        <XIcon />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="segmented segmented--compact">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                className={"segmented-btn" + (angle === a.id ? " active" : "")}
                onClick={() => {
                  setAngle(a.id);
                  setBeforeId(null);
                  setAfterId(null);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {ofAngle.length < 2 ? (
            <p className="empty-state">Necesitas al menos dos fotos de {ANGLES.find((a) => a.id === angle)?.label.toLowerCase()}.</p>
          ) : (
            <>
              <div className="photo-compare">
                {[before, after].map((p, i) => (
                  <div className="photo-compare-slot" key={i}>
                    <span className="photo-compare-label">{i === 0 ? "Antes" : "Después"}</span>
                    {p ? (
                      <img src={urls[p.id]} alt={i === 0 ? "Antes" : "Después"} />
                    ) : (
                      <span className="photo-compare-empty">Elige abajo</span>
                    )}
                    {p && <span className="photo-compare-date">{formatShortDate(p.date)}</span>}
                  </div>
                ))}
              </div>

              {/* The ribbon: tap to fill the empty side first, so a single
                  tap does the obvious thing rather than needing a slot
                  selected up front. */}
              <div className="photo-ribbon">
                {ofAngle.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      "photo-ribbon-item" +
                      (p.id === beforeId || p.id === afterId ? " is-picked" : "")
                    }
                    onClick={() => {
                      if (!beforeId) setBeforeId(p.id);
                      else if (!afterId && p.id !== beforeId) setAfterId(p.id);
                      else {
                        setBeforeId(p.id);
                        setAfterId(null);
                      }
                    }}
                  >
                    <img src={urls[p.id]} alt={formatShortDate(p.date)} />
                    <span>{formatShortDate(p.date)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="modal-hint">
        Solo en este dispositivo, pero <strong>sí van en la copia de seguridad</strong>.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
