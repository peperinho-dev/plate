// Progress photos, stored in IndexedDB and nowhere else.
//
// Deliberately not in the Zustand store: that persists to localStorage,
// which is a few megabytes of string storage shared by everything else in
// the app. One phone photo would fill it. IndexedDB holds Blobs natively,
// has orders of magnitude more room, and keeps the photos out of the JSON
// that the rest of the app serialises — so an export can't accidentally
// carry them.
//
// Everything here is origin-scoped browser storage on the device. There
// is no server, and nothing in this app uploads anywhere.
export type PhotoAngle = "front" | "side" | "back";

export const ANGLES: { id: PhotoAngle; label: string }[] = [
  { id: "front", label: "Frente" },
  { id: "side", label: "Perfil" },
  { id: "back", label: "Espalda" }
];

export interface PhotoRecord {
  /** `${date}:${angle}` — one photo per angle per day, as the reference app does. */
  id: string;
  date: string;
  angle: PhotoAngle;
  blob: Blob;
  width: number;
  height: number;
  addedAt: number;
}

const DB_NAME = "plate-photos";
const STORE = "photos";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export const photoId = (date: string, angle: PhotoAngle) => `${date}:${angle}`;

export async function listPhotos(): Promise<PhotoRecord[]> {
  const all = await tx<PhotoRecord[]>("readonly", (s) => s.getAll() as IDBRequest<PhotoRecord[]>);
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function putPhoto(record: PhotoRecord): Promise<void> {
  await tx("readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>);
}

export async function deletePhoto(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

/** Bytes held, so the gallery can say what it's using. */
export async function photosSize(): Promise<number> {
  const all = await listPhotos();
  return all.reduce((sum, p) => sum + p.blob.size, 0);
}

const MAX_EDGE = 1440;
const QUALITY = 0.82;

/**
 * Re-encodes a photo down to something a phone gallery would call a
 * thumbnail of itself: long edge capped, JPEG at 0.82.
 *
 * A modern phone photo is 3–6 MB and 4000px wide, which is far more than
 * a side-by-side comparison on a 400px screen can use. Storing the
 * original would burn the storage budget for no visible gain, and slow
 * every gallery render decoding pixels nobody sees.
 *
 * It also drops EXIF — including GPS coordinates — as a side effect of
 * re-encoding through a canvas, which for this particular kind of photo
 * is a feature.
 */
export async function downscale(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("could not encode");
  return { blob, width, height };
}

export interface SerialisedPhoto {
  id: string;
  date: string;
  angle: PhotoAngle;
  width: number;
  height: number;
  addedAt: number;
  /** data: URL. Base64 costs ~33% over the blob, which on downscaled
   *  photos is a few hundred KB for a year of them. */
  dataUrl: string;
}

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Photos in a form the backup JSON can carry. */
export async function exportPhotos(): Promise<SerialisedPhoto[]> {
  const all = await listPhotos();
  return Promise.all(
    all.map(async (p) => ({
      id: p.id,
      date: p.date,
      angle: p.angle,
      width: p.width,
      height: p.height,
      addedAt: p.addedAt,
      dataUrl: await toDataUrl(p.blob)
    }))
  );
}

/**
 * Restores photos from a backup, replacing whatever is there — the same
 * all-or-nothing semantics as the rest of import, so a restored device
 * matches the backup rather than merging into it.
 *
 * Tolerates a backup with no photos key at all: every export written
 * before photos existed is exactly that.
 */
export async function importPhotos(photos: SerialisedPhoto[] | undefined): Promise<number> {
  if (!Array.isArray(photos)) return 0;
  const existing = await listPhotos();
  await Promise.all(existing.map((p) => deletePhoto(p.id)));
  let restored = 0;
  for (const p of photos) {
    try {
      const blob = await (await fetch(p.dataUrl)).blob();
      await putPhoto({
        id: p.id,
        date: p.date,
        angle: p.angle,
        blob,
        width: p.width,
        height: p.height,
        addedAt: p.addedAt
      });
      restored += 1;
    } catch {
      // One unreadable photo shouldn't abandon the rest of the restore.
    }
  }
  return restored;
}
