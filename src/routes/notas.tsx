import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  Bold,
  Brain,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  FileType,
  FolderPlus,
  Hash,
  List,
  Loader2,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Square,
  Table as TableIcon,
  Trash2,
  Wand2,
} from "lucide-react";
import { exportPdf, exportWordDoc } from "@/lib/export-doc";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transcribeChunk } from "@/lib/ai.functions";
import { getDirHandle, writeMeetingToFolder } from "@/lib/folder";
import { saveMeeting, type Meeting } from "@/lib/idb";
import { startRecording, type RecorderHandle } from "@/lib/recorder";
import { addCardsToInbox, readLocalCards, TASKS_EVENT, type Card } from "@/lib/tasks";
import { parseTasksFromText, stripTaskBlock } from "@/lib/tasks-parse";
import {
  defaultTitle,
  extractTags,
  loadNotes,
  nid,
  saveNotes,
  TEMPLATES,
  type Note,
  type NotesState,
} from "@/lib/notes";

export const Route = createFileRoute("/notas")({
  component: SecondBrain,
  head: () => ({
    meta: [
      { title: "Notebook — notas y grabación en un mismo espacio" },
      {
        name: "description",
        content:
          "Bloc de notas avanzado con carpetas, plantillas, etiquetas y extracción de tareas al Kanban. Todo guardado en tu ordenador.",
      },
      {
        property: "og:title",
        content: "Notebook — notas y grabación en un mismo espacio",
      },
      {
        property: "og:description",
        content:
          "Notas en Markdown con carpetas, plantillas, etiquetas #, menciones @ del Kanban y extracción de acciones con IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KEY_LS = "acta-local-gemini-key";

function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  // Etiquetas #palabra convertidas en píldoras clicables
  return html.replace(
    /(^|[\s>])#([\p{L}\p{N}_-]{2,30})/gu,
    (_m, pre: string, tag: string) =>
      `${pre}<button type="button" data-tag="${tag.toLowerCase()}" class="nota-tag">#${tag}</button>`,
  );
}

function SecondBrain() {
  const [state, setState] = useState<NotesState>({ folders: [], notes: [] });
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [mention, setMention] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Panel de grabación (Lienzo de Reunión)
  const doTranscribe = useServerFn(transcribeChunk);
  const [panel, setPanel] = useState(true);
  const [preview, setPreview] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [live, setLive] = useState("");
  const [synthing, setSynthing] = useState(false);
  const liveRef = useRef("");
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const handleRef = useRef<RecorderHandle | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(handleRef.current?.elapsed() ?? 0), 500);
    return () => clearInterval(id);
  }, [recording]);

  // Recordar si la vista previa estaba oculta
  useEffect(() => {
    setPreview(localStorage.getItem("acta-local-preview") !== "off");
  }, []);
  const togglePreview = () => {
    setPreview((p) => {
      localStorage.setItem("acta-local-preview", p ? "off" : "on");
      return !p;
    });
  };


  useEffect(() => {
    void (async () => {
      setState(await loadNotes());
      setCards(readLocalCards());
      setLoaded(true);
    })();
    const onTasks = () => setCards(readLocalCards());
    window.addEventListener(TASKS_EVENT, onTasks);
    const onOpenNote = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setActiveId(id);
    };
    window.addEventListener("acta-abrir-nota", onOpenNote);
    return () => {
      window.removeEventListener(TASKS_EVENT, onTasks);
      window.removeEventListener("acta-abrir-nota", onOpenNote);
    };
  }, []);

  const persist = useCallback((next: NotesState) => {
    setState(next);
    void saveNotes(next);
  }, []);

  const active = state.notes.find((n) => n.id === activeId) ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.notes
      .filter((n) => (folderFilter ? n.folderId === folderFilter : true))
      .filter((n) => {
        if (!q) return true;
        const fecha = new Date(n.updatedAt).toLocaleDateString("es-ES").toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          fecha.includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.notes, folderFilter, query]);

  function newFolder() {
    const name = window.prompt("Nombre de la carpeta");
    if (!name?.trim()) return;
    persist({
      ...state,
      folders: [...state.folders, { id: nid(), name: name.trim(), createdAt: Date.now() }],
    });
  }

  function newNote(templateId = "libre") {
    const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]!;
    const now = Date.now();
    const note: Note = {
      id: nid(),
      folderId: folderFilter,
      title: defaultTitle(),
      content: tpl.body,
      createdAt: now,
      updatedAt: now,
    };
    persist({ ...state, notes: [note, ...state.notes] });
    setActiveId(note.id);
  }

  function updateActive(patch: Partial<Note>) {
    if (!active) return;
    persist({
      ...state,
      notes: state.notes.map((n) =>
        n.id === active.id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      ),
    });
  }

  function deleteNote(id: string) {
    persist({ ...state, notes: state.notes.filter((n) => n.id !== id) });
    if (activeId === id) setActiveId(null);
  }

  function renameNote(id: string) {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const name = window.prompt("Nuevo nombre de la nota", note.title);
    if (!name?.trim()) return;
    persist({
      ...state,
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, title: name.trim(), updatedAt: Date.now() } : n,
      ),
    });
  }

  /** Mueve una nota (arrastrada) a una carpeta o la saca de todas. */
  function moveNote(noteId: string, folderId: string | null) {
    const note = state.notes.find((n) => n.id === noteId);
    if (!note || note.folderId === folderId) return;
    persist({
      ...state,
      notes: state.notes.map((n) =>
        n.id === noteId ? { ...n, folderId, updatedAt: Date.now() } : n,
      ),
    });
    const destino = folderId
      ? (state.folders.find((f) => f.id === folderId)?.name ?? "la carpeta")
      : "Todas las notas";
    toast.success(`“${note.title}” movida a ${destino}`);
  }

  function deleteFolder(id: string) {
    persist({
      folders: state.folders.filter((f) => f.id !== id),
      notes: state.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
    });
    if (folderFilter === id) setFolderFilter(null);
  }

  /** Inserta texto en la posición del cursor del editor. */
  function insert(before: string, after = "", placeholder = "") {
    const el = areaRef.current;
    if (!el || !active) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = active.content.slice(start, end) || placeholder;
    const next = active.content.slice(0, start) + before + sel + after + active.content.slice(end);
    updateActive({ content: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + sel.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onContentChange(value: string) {
    updateActive({ content: value });
    const el = areaRef.current;
    if (el) {
      const before = value.slice(0, el.selectionStart);
      setMention(/@[\p{L}\p{N}_-]{0,20}$/u.test(before));
    }
  }

  function insertMention(card: Card) {
    const el = areaRef.current;
    if (!el || !active) return;
    const pos = el.selectionStart;
    const before = active.content.slice(0, pos).replace(/@[\p{L}\p{N}_-]{0,20}$/u, "");
    const next = `${before}**@${card.text}** ${active.content.slice(pos)}`;
    updateActive({ content: next });
    setMention(false);
    requestAnimationFrame(() => el.focus());
  }

  async function extractToKanban() {
    if (!active) return;
    const key = localStorage.getItem(KEY_LS)?.trim();
    if (!key) {
      toast.error("Falta tu clave de Gemini. Guárdala en los ajustes de Correos HTML.");
      return;
    }
    if (!active.content.trim()) {
      toast.error("La nota está vacía.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Extrae de estas notas únicamente las tareas ejecutables. Devuelve un array JSON con title y description, sin texto adicional.\n\n${active.content}`,
                  },
                ],
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        const msg =
          res.status === 403
            ? "Tu clave de Gemini no tiene permiso."
            : res.status === 429
              ? "Has superado el límite de Gemini. Inténtalo en unos minutos."
              : `Gemini devolvió un error (${res.status}).`;
        toast.error(msg);
        return;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const tasks = parseTasksFromText(text);
      if (!tasks.length) {
        toast.error("La IA no encontró acciones concretas en esta nota.");
        return;
      }
      const n = await addCardsToInbox(tasks);
      toast.success(`${n} tareas enviadas a la Bandeja de Entrada`);
    } catch {
      toast.error("No se pudo conectar con Gemini.");
    } finally {
      setBusy(false);
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("No se pudo leer el audio"));
      r.readAsDataURL(blob);
    });
  }

  function enqueueChunk(wav: Blob) {
    chainRef.current = chainRef.current.then(async () => {
      try {
        const audio = await blobToBase64(wav);
        const res = await doTranscribe({ data: { audio, speakers: true } });
        const text = res.text.trim();
        if (text) {
          liveRef.current = `${liveRef.current} ${text}`.trim();
          setLive(liveRef.current);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falló la transcripción de un fragmento");
      }
    });
  }

  async function startRec() {
    try {
      chainRef.current = Promise.resolve();
      handleRef.current = await startRecording({
        onLevel: setLevel,
        onChunk: (wav) => enqueueChunk(wav),
      });
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  async function stopRec() {
    const handle = handleRef.current;
    if (!handle) return;
    setRecording(false);
    setLevel(0);
    await handle.stop();
    handleRef.current = null;
    await chainRef.current;
    setLive(liveRef.current);
  }

  /** Combina las notas manuales y la transcripción en un acta final con Gemini. */
  async function synthesize() {
    if (!active) return;
    const key = localStorage.getItem(KEY_LS)?.trim();
    if (!key) {
      toast.error("Falta tu clave de Gemini. Guárdala en los ajustes.");
      return;
    }
    if (recording) await stopRec();
    const transcript = liveRef.current.trim();
    if (!transcript && !active.content.trim()) {
      toast.error("No hay notas ni transcripción que sintetizar.");
      return;
    }
    setSynthing(true);
    try {
      const prompt = `A continuación te proporciono dos fuentes de información de una reunión: 1. Las notas manuales del usuario (las prioridades). 2. La transcripción bruta del audio. Crea un acta final estructurada en HTML usando las notas como estructura principal y rellenando los detalles técnicos con el audio.\n\nFUENTE 1 — Notas manuales del usuario:\n${active.content || "(ninguna)"}\n\nFUENTE 2 — Transcripción bruta del audio:\n${transcript.slice(0, 120000) || "(ninguna)"}\n\nDevuelve solo el HTML del acta (sin \`\`\`), en español. Al final, añade además las acciones ejecutables como un array JSON con este formato exacto:\n\`\`\`json\n[{"title": "Acción en infinitivo", "description": "Contexto breve"}]\n\`\`\`\nSi no hay acciones, devuelve [].`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
        },
      );
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? "Tu clave de Gemini no tiene permiso."
            : res.status === 429
              ? "Has superado el límite de Gemini. Inténtalo en unos minutos."
              : `Gemini devolvió un error (${res.status}).`,
        );
        return;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const html = stripTaskBlock(raw)
        .replace(/```(?:html)?/g, "")
        .trim();
      if (!html) {
        toast.error("Gemini no devolvió ningún acta.");
        return;
      }
      const transcriptBlock = transcript
        ? `\n\n<details><summary>Transcripción bruta</summary>\n\n${transcript}\n\n</details>`
        : "";
      const meeting: Meeting = {
        id: `nb-${Date.now()}`,
        title: active.title || "Acta del Notebook",
        createdAt: Date.now(),
        durationMs: elapsed,
        transcript,
        summary: html,
        notes: [],
      };
      try {
        await saveMeeting(meeting);
        const dir = await getDirHandle();
        if (dir) await writeMeetingToFolder(dir, meeting);
      } catch {
        /* si falla el guardado en la lista de actas, el acta sigue en la nota */
      }

      updateActive({
        content: `${active.content.trim()}\n\n---\n\n## Acta final\n\n_También guardada en «Grabar Reunión» como «${meeting.title}»._\n\n${html}${transcriptBlock}\n`,
      });
      toast.success("Acta añadida a la nota y guardada en la lista de actas");

      const tasks = parseTasksFromText(raw);
      if (tasks.length) {
        const n = await addCardsToInbox(tasks);
        toast.success(`${n} tareas enviadas a la Bandeja de Entrada`);
      }
    } catch {
      toast.error("No se pudo conectar con Gemini.");
    } finally {
      setSynthing(false);
    }
  }

  const mmss = (ms: number) =>
    `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;



  const tags = active ? extractTags(active.content) : [];

  return (
    <div className="flex h-screen min-w-0 flex-1 bg-background">
      <Toaster />

      {/* Sidebar */}
      {sidebar && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
          <div className="space-y-3 border-b border-border/70 p-3">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <span className="font-display text-sm font-semibold">Notebook</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar notas…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => newNote()}>
                <Plus className="size-3.5" /> Nueva nota
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={newFolder} title="Nueva carpeta">
                <FolderPlus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => setFolderFilter(null)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("none");
              }}
              onDragLeave={() => setDragOver((d) => (d === "none" ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/acta-nota");
                if (id) moveNote(id, null);
              }}
              className={`mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium ${
                dragOver === "none"
                  ? "bg-primary/20 ring-1 ring-primary"
                  : folderFilter === null
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
              }`}
            >
              Todas las notas ({state.notes.length})
            </button>
            {state.folders.map((f) => (
              <div key={f.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setFolderFilter(f.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(f.id);
                  }}
                  onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData("text/acta-nota");
                    if (id) moveNote(id, f.id);
                  }}
                  className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs font-medium ${
                    dragOver === f.id
                      ? "bg-primary/20 ring-1 ring-primary"
                      : folderFilter === f.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                  }`}
                >
                  {f.name} ({state.notes.filter((n) => n.folderId === f.id).length})
                </button>
                <button
                  onClick={() => deleteFolder(f.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Borrar carpeta"
                >
                  <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}

            <p className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Notas
            </p>
            {loaded && visible.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Sin notas todavía.</p>
            )}
            {visible.map((n) => (
              <div
                key={n.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/acta-nota", n.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                title="Arrastra la nota a una carpeta"
                className={`group mb-1 flex cursor-grab items-start gap-1 rounded-md transition-colors active:cursor-grabbing ${
                  activeId === n.id ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <button
                  onClick={() => setActiveId(n.id)}
                  className="min-w-0 flex-1 px-2 py-2 text-left"
                >
                  <span className="block truncate text-xs font-medium">{n.title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {new Date(n.updatedAt).toLocaleDateString("es-ES")} ·{" "}
                    {n.content.replace(/[#*|>-]/g, " ").trim().slice(0, 40) || "vacía"}
                  </span>
                </button>
                <button
                  onClick={() => renameNote(n.id)}
                  className="mt-2 pr-1 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Cambiar nombre"
                >
                  <Pencil className="size-3 text-muted-foreground hover:text-primary" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setSidebar((s) => !s)}
            title={sidebar ? "Ocultar panel" : "Mostrar panel"}
          >
            {sidebar ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>

          {active ? (
            <>
              <Input
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                className="h-9 min-w-0 flex-1 border-none bg-transparent font-display text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <Select
                value={active.folderId ?? "none"}
                onValueChange={(v) => updateActive({ folderId: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Carpeta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin carpeta</SelectItem>
                  {state.folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs" onClick={() => void extractToKanban()} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Extraer acciones al Kanban
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => setPanel((p) => !p)}
                title={panel ? "Ocultar grabación" : "Mostrar grabación"}
              >
                {panel ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => deleteNote(active.id)}
                title="Borrar nota"
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Elige una nota o crea una nueva con una plantilla
              </span>
              <Select onValueChange={(v) => newNote(v)}>
                <SelectTrigger className="ml-auto h-8 w-52 text-xs">
                  <SelectValue placeholder="Nueva nota con plantilla…" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </header>

        {active ? (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              className={`flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row ${panel ? "lg:w-[70%] lg:flex-none" : ""}`}
            >
            {/* Escritura */}
            <div className="relative flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-1 border-b border-border/70 px-3 py-1.5">
                <Button size="icon" variant="ghost" className="size-7" title="Negrita" onClick={() => insert("**", "**", "texto")}>
                  <Bold className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" title="Lista" onClick={() => insert("\n- ", "", "elemento")}>
                  <List className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" title="Casilla" onClick={() => insert("\n- [ ] ", "", "tarea")}>
                  <CheckSquare className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="Tabla"
                  onClick={() => insert("\n\n| Columna | Columna |\n| --- | --- |\n|  |  |\n\n")}
                >
                  <TableIcon className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" title="Etiqueta" onClick={() => insert("#", "", "etiqueta")}>
                  <Hash className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title={preview ? "Ocultar vista previa" : "Mostrar vista previa"}
                  onClick={togglePreview}
                >
                  {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="Exportar a PDF"
                  onClick={() => {
                    if (!exportPdf(active.title, renderMarkdown(active.content)))
                      toast.error("El navegador bloqueó la ventana. Permite las ventanas emergentes.");
                  }}
                >
                  <FileText className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="Exportar a Word"
                  onClick={() => exportWordDoc(active.title, renderMarkdown(active.content))}
                >
                  <FileType className="size-3.5" />
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Escribe @ para mencionar tareas
                </span>
              </div>
              <textarea
                ref={areaRef}
                value={active.content}
                onChange={(e) => onContentChange(e.target.value)}
                onBlur={() => setTimeout(() => setMention(false), 150)}
                placeholder="Escribe en Markdown: **negrita**, - listas, - [ ] casillas, tablas y #etiquetas…"
                className="min-h-[40vh] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none"
              />
              {mention && (
                <div className="absolute bottom-16 left-4 z-20 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                  <p className="border-b border-border/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Tareas del Kanban
                  </p>
                  <div className="max-h-56 overflow-y-auto">
                    {cards.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground">No hay tareas.</p>
                    )}
                    {cards.slice(0, 30).map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertMention(c)}
                        className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-muted"
                      >
                        {c.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Vista renderizada */}
            {preview && (
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => setQuery(`#${t}`)}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className="nota-preview prose-sm max-w-none text-sm leading-relaxed"
                  onClick={(e) => {
                    const tag = (e.target as HTMLElement).dataset["tag"];
                    if (tag) setQuery(`#${tag}`);
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(active.content) }}
                />
              </div>
            )}
            </div>

            {/* Panel de grabación */}
            {panel && (
              <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[30%] lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
                  <Mic className="size-4 text-primary" />
                  <span className="font-display text-sm font-semibold">Grabación</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {mmss(elapsed)}
                  </span>
                </div>

                <div className="space-y-3 border-b border-border/70 p-3">
                  {recording ? (
                    <Button variant="destructive" className="w-full" onClick={() => void stopRec()}>
                      <Square className="size-4" /> Detener
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={() => void startRec()}>
                      <Mic className="size-4" /> Empezar a grabar
                    </Button>
                  )}
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width] duration-150"
                      style={{ width: `${Math.min(100, Math.round(level * 180))}%` }}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={synthing}
                    onClick={() => void synthesize()}
                  >
                    {synthing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Wand2 className="size-4" />
                    )}
                    Terminar y sintetizar
                  </Button>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Puedes seguir escribiendo en la nota mientras se graba. Al sintetizar, la IA
                    combina tus notas con lo que se ha dicho.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <p className="pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    Transcripción en vivo
                  </p>
                  {live ? (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {live}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">
                      {recording ? "Escuchando…" : "Aún no hay transcripción."}
                    </p>
                  )}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <Brain className="mx-auto size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Tu segundo cerebro, guardado en tu ordenador.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
