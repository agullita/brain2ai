// Tarjetas del tablero: guardadas en localStorage y, si hay archivo vinculado,
// también en el .json del ordenador. Compartido entre pantallas.

import { getFileHandle, writeFile } from "@/lib/taskfile";

export type Column = "bandeja" | "pendiente" | "camino" | "hecho";

export type Card = {
  id: string;
  text: string;
  note?: string;
  column: Column;
  createdAt: number;
  doneAt?: number;
  /** Fecha límite "YYYY-MM-DD" (opcional). */
  due?: string;
};

export const TASKS_LS_KEY = "acta-local-tareas";
export const TASKS_EVENT = "acta-tareas";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function readLocalCards(): Card[] {
  try {
    const raw = localStorage.getItem(TASKS_LS_KEY);
    return raw ? (JSON.parse(raw) as Card[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalCards(cards: Card[]): void {
  try {
    localStorage.setItem(TASKS_LS_KEY, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

async function writeToLinkedFile(cards: Card[]): Promise<void> {
  const h = await getFileHandle();
  if (!h) return;
  try {
    await writeFile(h, { cards, updatedAt: Date.now() });
  } catch {
    /* sin permiso: se conserva en la app */
  }
}

/** Añade tarjetas a la bandeja de entrada y guarda en todos los sitios. */
export async function addCardsToInbox(
  items: { title: string; description?: string }[],
): Promise<number> {
  const clean = items
    .map((t) => ({ title: (t.title ?? "").trim(), description: (t.description ?? "").trim() }))
    .filter((t) => t.title);
  if (!clean.length) return 0;

  const now = Date.now();
  const nuevas: Card[] = clean.map((t, i) => ({
    id: uid(),
    text: t.title,
    ...(t.description ? { note: t.description } : {}),
    column: "bandeja" as const,
    createdAt: now + i,
  }));

  const cards = [...nuevas, ...readLocalCards()];
  writeLocalCards(cards);
  await writeToLinkedFile(cards);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_EVENT));
  return nuevas.length;
}

export { parseTasksFromText, stripTaskBlock } from "@/lib/tasks-parse";
