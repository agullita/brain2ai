// Búsqueda global (Ctrl/Cmd + K): recorre tareas, actas e ideas guardadas en local.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileAudio, Lightbulb, ListTodo, NotebookPen, Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listMeetings, type Meeting } from "@/lib/idb";
import { readLocalNotes, NOTES_EVENT, type Note } from "@/lib/notes";
import { readLocalCards, TASKS_EVENT, type Card, type Column } from "@/lib/tasks";

const FOCO_KEY = "next3actions:v1";

type Idea = { id: string; text: string };

const COLUMN_LABEL: Record<Column, string> = {
  bandeja: "Bandeja de entrada (IA)",
  pendiente: "Pendiente",
  camino: "En camino",
  hecho: "Hecho",
};

type Hit =
  | { kind: "task"; id: string; title: string; snippet: string; meta: string; card: Card }
  | { kind: "meeting"; id: string; title: string; snippet: string; meta: string; meeting: Meeting }
  | { kind: "note"; id: string; title: string; snippet: string; meta: string }
  | { kind: "idea"; id: string; title: string; snippet: string; meta: string };

function snippetOf(text: string, q: string, len = 120): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, len);
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + q.length + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-primary/20 px-0.5 font-semibold text-primary">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function readParking(): Idea[] {
  try {
    const raw = localStorage.getItem(FOCO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { parking?: Idea[] };
    return Array.isArray(parsed.parking) ? parsed.parking : [];
  } catch {
    return [];
  }
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [task, setTask] = useState<Card | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setCards(readLocalCards());
    setIdeas(readParking());
    setNotes(readLocalNotes().notes);
    void listMeetings().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("acta-search", onOpen);
    window.addEventListener(TASKS_EVENT, load);
    window.addEventListener(NOTES_EVENT, load);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("acta-search", onOpen);
      window.removeEventListener(TASKS_EVENT, load);
      window.removeEventListener(NOTES_EVENT, load);
    };
  }, [load]);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ("");
    }
  }, [open, load]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const out: Hit[] = [];

    for (const c of cards) {
      const hay = `${c.text} ${c.note ?? ""}`;
      if (!hay.toLowerCase().includes(term)) continue;
      const source = c.text.toLowerCase().includes(term) ? c.text : (c.note ?? c.text);
      out.push({
        kind: "task",
        id: c.id,
        title: c.text,
        snippet: snippetOf(source, term),
        meta: c.column === "hecho" ? "Completada" : COLUMN_LABEL[c.column],
        card: c,
      });
    }

    for (const m of meetings) {
      const inSummary = m.summary?.toLowerCase().includes(term);
      const inTranscript = m.transcript?.toLowerCase().includes(term);
      const inTitle = m.title?.toLowerCase().includes(term);
      if (!inSummary && !inTranscript && !inTitle) continue;
      const source = inSummary ? m.summary : inTranscript ? m.transcript : m.title;
      out.push({
        kind: "meeting",
        id: m.id,
        title: m.title || "Reunión sin título",
        snippet: snippetOf(source ?? "", term),
        meta: inSummary ? "Acta" : inTranscript ? "Transcripción" : "Título",
        meeting: m,
      });
    }

    for (const n of notes) {
      const inTitle = n.title.toLowerCase().includes(term);
      const inBody = n.content.toLowerCase().includes(term);
      if (!inTitle && !inBody) continue;
      out.push({
        kind: "note",
        id: n.id,
        title: n.title,
        snippet: snippetOf(inBody ? n.content : n.title, term),
        meta: new Date(n.updatedAt).toLocaleDateString("es-ES"),
      });
    }

    for (const i of ideas) {
      if (!i.text.toLowerCase().includes(term)) continue;
      out.push({
        kind: "idea",
        id: i.id,
        title: i.text,
        snippet: snippetOf(i.text, term),
        meta: "Parking Lot",
      });
    }

    return out;
  }, [q, cards, meetings, ideas, notes]);

  const groups = [
    { kind: "task" as const, label: "Tareas", Icon: ListTodo },
    { kind: "meeting" as const, label: "Reuniones / Actas", Icon: FileAudio },
    { kind: "note" as const, label: "Notas (Second Brain)", Icon: NotebookPen },
    { kind: "idea" as const, label: "Ideas (Parking Lot)", Icon: Lightbulb },
  ];

  const term = q.trim();

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en tareas, actas e ideas…"
              className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          {term.length >= 2 && (
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin resultados para “{term}”.
                </p>
              ) : (
                groups.map(({ kind, label, Icon }) => {
                  const rows = hits.filter((h) => h.kind === kind);
                  if (!rows.length) return null;
                  return (
                    <div key={kind} className="mb-2">
                      <p className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        <Icon className="size-3.5" /> {label} ({rows.length})
                      </p>
                      {rows.map((h) => (
                        <button
                          key={`${h.kind}-${h.id}`}
                          onClick={() => {
                            if (h.kind === "task") setTask(h.card);
                            else if (h.kind === "meeting") setMeeting(h.meeting);
                            else if (h.kind === "note") {
                              const id = h.id;
                              void navigate({ to: "/notas" }).then(() =>
                                setTimeout(
                                  () =>
                                    window.dispatchEvent(
                                      new CustomEvent("acta-abrir-nota", { detail: id }),
                                    ),
                                  120,
                                ),
                              );
                            }
                            setOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-medium">
                              <Highlight text={h.title} q={term} />
                            </span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {h.meta}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            <Highlight text={h.snippet} q={term} />
                          </p>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalle de tarea */}
      <Sheet open={!!task} onOpenChange={(v) => !v && setTask(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-left">{task?.text}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {task ? (task.column === "hecho" ? "Completada" : COLUMN_LABEL[task.column]) : ""}
            </p>
            {task?.note && <p className="whitespace-pre-wrap leading-relaxed">{task.note}</p>}
            {task && (
              <p className="text-xs text-muted-foreground">
                Creada el {new Date(task.createdAt).toLocaleString("es-ES")}
                {task.doneAt ? ` · Hecha el ${new Date(task.doneAt).toLocaleString("es-ES")}` : ""}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Lectura del acta */}
      <Sheet open={!!meeting} onOpenChange={(v) => !v && setMeeting(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">{meeting?.title}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-8 text-sm">
            {meeting && (
              <p className="text-xs text-muted-foreground">
                {new Date(meeting.createdAt).toLocaleString("es-ES")}
              </p>
            )}
            {meeting?.summary && (
              <section className="space-y-2">
                <h3 className="font-display text-sm font-semibold">Acta</h3>
                <p className="whitespace-pre-wrap leading-relaxed">{meeting.summary}</p>
              </section>
            )}
            {meeting?.transcript && (
              <section className="space-y-2">
                <h3 className="font-display text-sm font-semibold">Transcripción</h3>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {meeting.transcript}
                </p>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function openGlobalSearch() {
  window.dispatchEvent(new Event("acta-search"));
}
