// Copia de seguridad de toda la información local (sin salir del ordenador).

import { deleteMeeting, listMeetings, saveMeeting } from "@/lib/idb";

const CLAVE_API = "acta-local-gemini-key";

export type Backup = {
  app: "acta-local";
  version: 1;
  exportedAt: string;
  storage: Record<string, string>;
  meetings: unknown[];
};

/** Genera el objeto de copia de seguridad: ajustes, notas, tareas, correos y actas. */
export async function buildBackup(): Promise<Backup> {
  const storage: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("acta-") || k === CLAVE_API) continue;
    const v = localStorage.getItem(k);
    if (v !== null) storage[k] = v;
  }

  let meetings: unknown[] = [];
  try {
    meetings = (await listMeetings()).map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      durationMs: m.durationMs,
      transcript: m.transcript,
      summary: m.summary,
      notes: m.notes,
    }));
  } catch {
    meetings = [];
  }

  return {
    app: "acta-local",
    version: 1,
    exportedAt: new Date().toISOString(),
    storage,
    meetings,
  };
}

/** Descarga la copia de seguridad como archivo .json. */
export async function downloadBackup(): Promise<void> {
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `brain2ai-copia-${fecha}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Restaura una copia de seguridad desde un archivo .json.
 * Sustituye TODO lo que hay ahora: ajustes, notas, tareas, correos y actas.
 */
export async function restoreBackup(file: File): Promise<{ storage: number; meetings: number }> {
  const text = await file.text();
  let data: Backup;
  try {
    data = JSON.parse(text) as Backup;
  } catch {
    throw new Error("formato");
  }
  if (data?.app !== "acta-local" || typeof data.storage !== "object" || data.storage === null) {
    throw new Error("formato");
  }

  // 1. Ajustes, notas, tareas y correos (localStorage).
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith("acta-") && k !== CLAVE_API) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(data.storage)) {
    localStorage.setItem(k, v);
  }

  // 2. Actas (IndexedDB): se vacía y se vuelve a llenar.
  let meetings = 0;
  try {
    const existing = await listMeetings();
    for (const m of existing) await deleteMeeting(m.id);
    const restored = (data.meetings ?? []) as Array<{ id: string }>;
    for (const m of restored) {
      await saveMeeting(m as never);
      meetings++;
    }
  } catch {
    /* si falla el audio, el resto ya está restaurado */
  }

  return { storage: Object.keys(data.storage).length, meetings };
}
