// Archivo .json local para el tablero de tareas (File System Access API).
// El permiso/handle se guarda en IndexedDB para recordarlo entre sesiones.

const DB_NAME = "acta-local-tareas-fs";
const STORE = "kv";
const KEY = "file-handle";

type AnyHandle = any;

function openKv(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function fileSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export async function setFileHandle(handle: AnyHandle | null): Promise<void> {
  const db = await openKv();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    const s = t.objectStore(STORE);
    if (handle) s.put(handle, KEY);
    else s.delete(KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  db.close();
}

export async function getFileHandle(): Promise<AnyHandle | null> {
  try {
    const db = await openKv();
    const value = await new Promise<AnyHandle | null>((res, rej) => {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).get(KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function ensurePermission(handle: AnyHandle): Promise<boolean> {
  try {
    const opts = { mode: "readwrite" as const };
    if ((await handle.queryPermission?.(opts)) === "granted") return true;
    return (await handle.requestPermission?.(opts)) === "granted";
  } catch {
    return false;
  }
}

export async function pickNewFile(): Promise<AnyHandle | null> {
  if (!fileSupported()) return null;
  const handle = await (window as any).showSaveFilePicker({
    suggestedName: "tareas.json",
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  });
  await setFileHandle(handle);
  return handle;
}

export async function pickExistingFile(): Promise<AnyHandle | null> {
  if (typeof window === "undefined" || !("showOpenFilePicker" in window)) return null;
  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  });
  await setFileHandle(handle);
  return handle ?? null;
}

export async function readFile<T>(handle: AnyHandle): Promise<T | null> {
  if (!(await ensurePermission(handle))) return null;
  try {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeFile(handle: AnyHandle, data: unknown): Promise<void> {
  if (!(await ensurePermission(handle))) throw new Error("Sin permiso sobre el archivo");
  const w = await handle.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}
