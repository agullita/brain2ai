// Second Brain: carpetas y notas guardadas en localStorage y, si hay carpeta
// vinculada, también en notas.json dentro de la carpeta del ordenador.

import { getDirHandle, readJsonFromFolder, writeJsonToFolder } from "@/lib/folder";

export type NoteFolder = { id: string; name: string; createdAt: number };

export type Note = {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type NotesState = { folders: NoteFolder[]; notes: Note[] };

export const NOTES_LS_KEY = "acta-local-notas";
export const NOTES_EVENT = "acta-notas";
export const NOTES_FILE = "notas.json";

export const EMPTY_NOTES: NotesState = { folders: [], notes: [] };

export const nid = () => Math.random().toString(36).slice(2, 10);

export function readLocalNotes(): NotesState {
  try {
    const raw = localStorage.getItem(NOTES_LS_KEY);
    if (!raw) return EMPTY_NOTES;
    const parsed = JSON.parse(raw) as Partial<NotesState>;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    return EMPTY_NOTES;
  }
}

export function writeLocalNotes(state: NotesState): void {
  try {
    localStorage.setItem(NOTES_LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_EVENT));
}

/** Guarda en localStorage y, si existe, en la carpeta local elegida. */
export async function saveNotes(state: NotesState): Promise<void> {
  writeLocalNotes(state);
  try {
    const dir = await getDirHandle();
    if (dir) await writeJsonToFolder(dir, NOTES_FILE, state);
  } catch {
    /* sin permiso: se conserva en la app */
  }
}

/** Carga desde la carpeta local si la hay; si no, desde localStorage. */
export async function loadNotes(): Promise<NotesState> {
  try {
    const dir = await getDirHandle();
    if (dir) {
      const fromFile = await readJsonFromFolder<NotesState>(dir, NOTES_FILE);
      if (fromFile && Array.isArray(fromFile.notes)) {
        writeLocalNotes(fromFile);
        return { folders: fromFile.folders ?? [], notes: fromFile.notes };
      }
    }
  } catch {
    /* seguimos con localStorage */
  }
  return readLocalNotes();
}

export function extractTags(text: string): string[] {
  const found = text.match(/(^|\s)#([\p{L}\p{N}_-]{2,30})/gu) ?? [];
  return [...new Set(found.map((t) => t.trim().slice(1).toLowerCase()))];
}

export function defaultTitle(d = new Date()): string {
  const fecha = d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `Nota — ${fecha}, ${hora}`;
}

export const TEMPLATES: { id: string; name: string; body: string }[] = [
  { id: "libre", name: "Plantilla Libre", body: "" },
  {
    id: "reunion",
    name: "Reunión general",
    body: `## Asistentes\n- \n\n## Temas tratados\n1. \n\n## Acuerdos\n- [ ] \n\n## Próximos pasos\n- [ ] \n\n#reunion`,
  },
  {
    id: "uno-a-uno",
    name: "Reunión 1:1",
    body: `## Persona\n\n## Cómo va todo\n- \n\n## Logros desde la última vez\n- [ ] \n\n## Bloqueos y preocupaciones\n- \n\n## Acciones\n- [ ] **Yo:** \n- [ ] **Él/Ella:** \n\n## Para la próxima\n- \n\n#1a1`,
  },
  {
    id: "daily",
    name: "Daily / Standup",
    body: `## Ayer\n- \n\n## Hoy\n- \n\n## Bloqueos\n- \n\n## Tareas movidas\n- [ ] \n\n#daily`,
  },
  {
    id: "cliente",
    name: "Reunión con cliente",
    body: `## Cliente\n**Fecha:** \n**Asistentes:** \n\n## Objetivo de la reunión\n\n## Puntos tratados\n1. \n\n## Compromisos nuestros\n- [ ] \n\n## Compromisos del cliente\n- [ ] \n\n## Presupuesto / plazos\n\n#cliente`,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    body: `## Objetivo\n\n## Ideas (sin filtro)\n- \n\n## Las 3 mejores\n1. \n\n## Riesgos\n- \n\n## Primer paso\n- [ ] \n\n#brainstorm`,
  },
  {
    id: "evaluacion",
    name: "Plantilla de Evaluación",
    body: `## Persona / Área evaluada\n\n## Criterios\n| Criterio | Valoración | Comentario |\n| --- | --- | --- |\n|  |  |  |\n\n## Puntos fuertes\n- \n\n## Áreas de mejora\n- \n\n## Acciones acordadas\n- [ ] \n\n#evaluacion`,
  },
  {
    id: "incidencias",
    name: "Plantilla de Incidencias",
    body: `## Incidencia\n**Fecha y hora:** \n**Detectada por:** \n\n## Descripción\n\n## Impacto\n\n## Causa probable\n\n## Acciones correctoras\n- [ ] \n\n#incidencia`,
  },
];
