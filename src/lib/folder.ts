// Carpeta local elegida por el usuario (File System Access API).
// El permiso se guarda en IndexedDB para recordarla entre sesiones.

import type { Meeting } from "./idb";

const DB_NAME = "acta-local-fs";
const STORE = "kv";
const KEY = "dir-handle";

type AnyHandle = any;

function openKv(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function folderSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function setDirHandle(handle: AnyHandle | null): Promise<void> {
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

export async function getDirHandle(): Promise<AnyHandle | null> {
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

export async function pickFolder(): Promise<AnyHandle | null> {
  if (!folderSupported()) return null;
  const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  await setDirHandle(handle);
  return handle;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "reunion";

/** Lee un JSON de la carpeta elegida (null si no existe o no hay permiso). */
export async function readJsonFromFolder<T>(handle: AnyHandle, name: string): Promise<T | null> {
  try {
    if (!(await ensurePermission(handle))) return null;
    const fh = await handle.getFileHandle(name);
    const text = await (await fh.getFile()).text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Escribe un JSON en la carpeta elegida. */
export async function writeJsonToFolder(
  handle: AnyHandle,
  name: string,
  data: unknown,
): Promise<void> {
  if (!(await ensurePermission(handle))) throw new Error("Sin permiso sobre la carpeta");
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

async function writeFile(dir: AnyHandle, name: string, data: Blob | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** Escribe el acta, la transcripción y (si existe) el audio en la carpeta elegida. */
export async function writeMeetingToFolder(handle: AnyHandle, m: Meeting): Promise<void> {
  if (!(await ensurePermission(handle))) throw new Error("Sin permiso sobre la carpeta");
  const date = new Date(m.createdAt).toISOString().slice(0, 10);
  const base = `${date}-${slug(m.title)}`;
  const dir = await handle.getDirectoryHandle(base, { create: true });

  const md = [
    `# ${m.title}`,
    ``,
    `Fecha: ${new Date(m.createdAt).toLocaleString("es-ES")}`,
    ``,
    m.summary ? `## Acta\n\n${m.summary}\n` : "",
    m.notes.length
      ? `## Notas\n\n${m.notes.map((n) => `- ${n.text}`).join("\n")}\n`
      : "",
    `## Transcripción\n\n${m.transcript || "(sin transcripción)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  await writeFile(dir, "acta.md", md);
  if (m.audio) {
    const ext = (m.audioType ?? "").includes("mpeg")
      ? "mp3"
      : (m.audioType ?? "").includes("mp4")
        ? "m4a"
        : (m.audioType ?? "").includes("wav")
          ? "wav"
          : "webm";
    await writeFile(dir, `audio.${ext}`, m.audio);
  }
}
