import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarIcon,
  CheckCircle2,
  Circle,
  FileJson,
  Inbox,
  ListTodo,
  Plus,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fileSupported,
  getFileHandle,
  pickExistingFile,
  pickNewFile,
  readFile,
  setFileHandle,
  writeFile,
} from "@/lib/taskfile";
import { TASKS_EVENT, TASKS_LS_KEY, uid, type Card, type Column } from "@/lib/tasks";
import {
  checkReminders,
  enableReminders,
  remindersEnabled,
  startReminderLoop,
  todayISO,
} from "@/lib/reminders";

export const Route = createFileRoute("/tareas")({
  component: TasksBoard,
  head: () => ({
    meta: [
      { title: "Tareas — tablero pendiente, en camino y hecho" },
      {
        name: "description",
        content:
          "Tablero de tarjetas con tres columnas: pendiente, en camino y hecho. Todo se guarda en tu propio ordenador, sin cuentas ni servidores.",
      },
      { property: "og:title", content: "Tareas — tablero pendiente, en camino y hecho" },
      {
        property: "og:description",
        content:
          "Mueve tus tarjetas entre pendiente, en camino y hecho. Guardado en tu ordenador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const COLUMNS: { id: Column; label: string; icon: typeof Circle }[] = [
  { id: "bandeja", label: "Bandeja de entrada (IA)", icon: Inbox },
  { id: "pendiente", label: "Pendiente", icon: Circle },
  { id: "camino", label: "En camino", icon: Timer },
  { id: "hecho", label: "Hecho", icon: CheckCircle2 },
];

const LS_KEY = TASKS_LS_KEY;

function dueState(due: string): "vencida" | "hoy" | "proxima" {
  const today = todayISO();
  if (due < today) return "vencida";
  if (due <= todayISO(new Date(Date.now() + 86400000))) return "hoy";
  return "proxima";
}

const DUE_CLASSES: Record<"vencida" | "hoy" | "proxima", string> = {
  vencida: "bg-destructive/10 text-destructive",
  hoy: "bg-primary/10 text-primary",
  proxima: "bg-muted text-muted-foreground",
};

function formatDue(due: string): string {
  return format(new Date(`${due}T00:00:00`), "d 'de' MMM", { locale: es });
}

function TasksBoard() {
  const [cards, setCards] = useState<Card[]>([]);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [reminders, setReminders] = useState(false);
  const handleRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Comprobador de recordatorios: al abrir y cada hora.
  useEffect(() => {
    setReminders(remindersEnabled());
    return startReminderLoop();
  }, []);

  // Carga inicial: archivo vinculado si existe, si no localStorage.
  useEffect(() => {
    let cancel = false;
    (async () => {
      let loaded: Card[] | null = null;
      const h = await getFileHandle();
      if (h) {
        const data = await readFile<{ cards: Card[] }>(h);
        if (data?.cards) {
          handleRef.current = h;
          if (!cancel) setFileName(h.name ?? "tareas.json");
          loaded = data.cards;
        }
      }
      if (!loaded) {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) loaded = JSON.parse(raw) as Card[];
        } catch {
          loaded = null;
        }
      }
      if (!cancel) {
        setCards(loaded ?? []);
        setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Tareas enviadas desde las actas de reuniones (u otra pestaña).
  useEffect(() => {
    if (!ready) return;
    const reload = () => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setCards(JSON.parse(raw) as Card[]);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(TASKS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(TASKS_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [ready]);

  // Guardado automático: localStorage siempre, archivo si está vinculado.
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cards));
    } catch {
      /* ignore */
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const h = handleRef.current;
      if (!h) return;
      void writeFile(h, { cards, updatedAt: Date.now() }).catch(() =>
        toast.error("No se pudo escribir en el archivo del ordenador"),
      );
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cards, ready]);

  const add = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    setCards((c) => [{ id: uid(), text: t, column: "pendiente", createdAt: Date.now() }, ...c]);
    setText("");
  }, [text]);

  const move = useCallback((id: string, column: Column) => {
    setCards((c) =>
      c.map((card) => {
        if (card.id !== id) return card;
        const { doneAt: _omit, ...rest } = card;
        return column === "hecho"
          ? { ...rest, column, doneAt: Date.now() }
          : { ...rest, column };
      }),
    );

  }, []);

  // Crea una tarjeta a partir de texto arrastrado desde otra ventana:
  // las primeras ~12 palabras (máx. 60 caracteres) son el título y el resto la descripción.
  const addFromText = useCallback((raw: string, column: Column) => {
    const full = raw.trim().replace(/\s+/g, " ");
    if (!full) return;
    let title = full;
    let note: string | undefined;
    if (full.length > 60) {
      const words = full.split(" ");
      let cut = "";
      let i = 0;
      while (i < words.length && i < 12 && (cut + " " + words[i]).trim().length <= 60) {
        cut = (cut + " " + words[i]).trim();
        i++;
      }
      if (!cut) cut = full.slice(0, 60);
      title = cut;
      note = full;
    }
    const card: Card = { id: uid(), text: title, column, createdAt: Date.now() };
    if (note !== undefined) card.note = note;
    setCards((c) => [card, ...c]);
    toast.success("Tarjeta creada con el texto arrastrado");
  }, []);

  const remove = useCallback((id: string) => {
    setCards((c) => c.filter((card) => card.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setCards((c) => c.filter((card) => card.column !== "hecho"));
    toast.success("Tarjetas hechas borradas");
  }, []);

  const linkNew = useCallback(async () => {
    if (!fileSupported()) {
      toast.error("Tu navegador no permite elegir archivo. Usa Chrome o Edge en el ordenador.");
      return;
    }
    try {
      const h = await pickNewFile();
      if (!h) return;
      handleRef.current = h;
      setFileName(h.name ?? "tareas.json");
      await writeFile(h, { cards, updatedAt: Date.now() });
      toast.success("Tareas guardadas en tu archivo");
    } catch {
      /* cancelado */
    }
  }, [cards]);

  const linkExisting = useCallback(async () => {
    try {
      const h = await pickExistingFile();
      if (!h) return;
      const data = await readFile<{ cards: Card[] }>(h);
      handleRef.current = h;
      setFileName(h.name ?? "tareas.json");
      if (data?.cards) setCards(data.cards);
      toast.success("Archivo vinculado");
    } catch {
      /* cancelado */
    }
  }, []);

  const unlink = useCallback(async () => {
    await setFileHandle(null);
    handleRef.current = null;
    setFileName(null);
    toast("Ya no se guarda en el archivo. Las tarjetas siguen en la app.");
  }, []);

  const setDue = useCallback((id: string, due?: string) => {
    setCards((c) =>
      c.map((card) => {
        if (card.id !== id) return card;
        if (!due) {
          const { due: _omit, ...rest } = card;
          return rest;
        }
        return { ...card, due };
      }),
    );
  }, []);

  const askReminders = useCallback(async () => {
    const r = await enableReminders();
    setReminders(remindersEnabled());
    if (r === "granted") {
      const n = checkReminders();
      toast.success(n > 0 ? `Recordatorios activados: ${n} tarea(s) requieren tu atención` : "Recordatorios activados");
    } else if (r === "denied") {
      toast.error("Has bloqueado las notificaciones. Permítelas en la configuración del navegador.");
    } else {
      toast.error("Tu navegador no soporta notificaciones.");
    }
  }, []);

  const byColumn = useMemo(() => {
    const map: Record<Column, Card[]> = { bandeja: [], pendiente: [], camino: [], hecho: [] };
    for (const c of cards) (map[c.column] ?? map.pendiente).push(c);
    return map;
  }, [cards]);

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListTodo className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Tareas</h1>
              <p className="text-xs text-muted-foreground">
                Tres columnas, tarjetas que se arrastran. Todo en tu ordenador.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!reminders && (
              <Button variant="outline" size="sm" onClick={() => void askReminders()}>
                <Bell className="mr-2 size-4" />
                Activar recordatorios
              </Button>
            )}
            {reminders && (
              <Button variant="ghost" size="sm" onClick={() => void checkReminders()}>
                <Bell className="mr-2 size-4 text-primary" />
                Recordatorios activados
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void (fileName ? unlink() : linkNew())}>
              <FileJson className="mr-2 size-4" />
              {fileName ? `Archivo: ${fileName}` : "Guardar en un archivo"}
            </Button>
            {!fileName && (
              <Button variant="ghost" size="sm" onClick={() => void linkExisting()}>
                Abrir archivo
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Nueva tarjeta…"
          />
          <Button onClick={add} disabled={!text.trim()}>
            <Plus className="mr-2 size-4" />
            Añadir
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const list = byColumn[col.id];
            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  // Acepta tarjetas internas y texto plano arrastrado desde otra ventana.
                  if (!dragId && !e.dataTransfer.types.includes("text/plain")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = dragId ? "move" : "copy";
                  setOver(col.id);
                }}
                onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  if (dragId) {
                    move(dragId, col.id);
                    setDragId(null);
                    return;
                  }
                  const dropped = e.dataTransfer.getData("text/plain");
                  if (dropped.trim()) addFromText(dropped, col.id);
                }}
                className={`rounded-2xl border p-3 transition-colors ${
                  over === col.id
                    ? dragId
                      ? "border-primary bg-primary/5"
                      : "border-dashed border-primary bg-primary/5"
                    : "border-border/70 bg-card/40"
                }`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" />
                    {col.label}
                    <span className="text-xs text-muted-foreground">({list.length})</span>
                  </div>
                  {col.id === "hecho" && list.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearDone}>
                      <Trash2 className="mr-1 size-3.5" />
                      Borrar todo
                    </Button>
                  )}
                </div>

                <div className="flex min-h-24 flex-col gap-2">
                  {list.length === 0 && (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      Arrastra aquí una tarjeta o texto seleccionado
                    </p>
                  )}
                  {list.map((card) => {
                    const i = COLUMNS.findIndex((c) => c.id === card.column);
                    return (
                      <article
                        key={card.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-card-id", card.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(card.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={`group cursor-grab rounded-xl border border-border/70 bg-card p-3 shadow-sm active:cursor-grabbing ${
                          dragId === card.id ? "opacity-50" : ""
                        }`}
                      >
                        <p
                          className={`text-sm ${
                            card.column === "hecho" ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {card.text}
                        </p>
                        {card.note && card.note !== card.text && (
                          <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">
                            {card.note}
                          </p>
                        )}
                        {card.due && card.column !== "hecho" && (
                          <span
                            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${DUE_CLASSES[dueState(card.due)]}`}
                          >
                            <CalendarIcon className="size-3" />
                            {dueState(card.due) === "vencida"
                              ? `Venció el ${formatDue(card.due)}`
                              : dueState(card.due) === "hoy"
                                ? "Vence hoy"
                                : formatDue(card.due)}
                          </span>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <div className="flex gap-1">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`size-7 ${card.due ? "text-primary" : ""}`}
                                  title={card.due ? "Cambiar fecha límite" : "Poner fecha límite"}
                                >
                                  <CalendarIcon className="size-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={card.due ? new Date(`${card.due}T00:00:00`) : undefined}
                                  onSelect={(d) => {
                                    if (d) setDue(card.id, format(d, "yyyy-MM-dd"));
                                  }}
                                  className="p-3 pointer-events-auto"
                                />
                                {card.due && (
                                  <div className="border-t border-border/70 p-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full text-xs"
                                      onClick={() => setDue(card.id)}
                                    >
                                      <X className="mr-1 size-3.5" /> Quitar fecha
                                    </Button>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              disabled={i === 0}
                              onClick={() => move(card.id, COLUMNS[i - 1]!.id)}
                              title="Mover a la izquierda"
                            >
                              <ArrowLeft className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              disabled={i === COLUMNS.length - 1}
                              onClick={() => move(card.id, COLUMNS[i + 1]!.id)}
                              title="Mover a la derecha"
                            >
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </div>
                          {card.column === "hecho" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(card.id)}
                              title="Borrar tarjeta"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
