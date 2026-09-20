// Almacenamiento 100% local en el navegador (IndexedDB). Sin base de datos externa.

export type Note = { t: number; text: string };

export type Meeting = {
  id: string;
  title: string;
  createdAt: number;
  durationMs: number;
  transcript: string;
  summary: string;
  notes: Note[];
  audio?: Blob | undefined;
  audioType?: string | undefined;
};

const DB_NAME = "actas-local";
const STORE = "meetings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
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
      }),
  );
}

export async function listMeetings(): Promise<Meeting[]> {
  const all = await tx<Meeting[]>("readonly", (s) => s.getAll() as IDBRequest<Meeting[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveMeeting(m: Meeting): Promise<void> {
  await tx("readwrite", (s) => s.put(m) as IDBRequest<IDBValidKey>);
}

export async function deleteMeeting(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

export async function estimateUsage(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  }
  return { usage: 0, quota: 0 };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
