import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  FileJson,
  Inbox,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Sunset,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/foco")({
  component: Next3Actions,
  head: () => ({
    meta: [
      { title: "Next 3 Actions — solo tres tareas, foco real" },
      {
        name: "description",
        content:
          "Tablero minimalista de productividad: máximo 3 acciones activas, parking lot de ideas, temporizadores y cierre de jornada. Todo se guarda en tu ordenador.",
      },
      { property: "og:title", content: "Next 3 Actions — solo tres tareas, foco real" },
      {
        property: "og:description",
        content:
          "Máximo 3 acciones activas, parking lot de ideas y cierre de jornada. Sin nube: tus datos viven en tu equipo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

// ---------- tipos y estado ----------

type Task = {
  id: string;
  action: string;
  outcome: string;
  minutes: number;
  remaining: number; // segundos
  running: boolean;
  done: boolean;
  completedAt?: number;
};

type Idea = { id: string; text: string };

type State = {
  tasks: Task[];
  parking: Idea[];
  completed: { id: string; action: string; outcome: string; completedAt: number }[];
};

const EMPTY: State = { tasks: [], parking: [], completed: [] };
const LS_KEY = "next3actions:v1";
const FILE_HANDLE_KEY = "next3actions:file";

const uid = () => Math.random().toString(36).slice(2, 10);

const newTask = (action = "", outcome = ""): Task => ({
  id: uid(),
  action,
  outcome,
  minutes: 30,
  remaining: 30 * 60,
  running: false,
  done: false,
});

const isToday = (ts: number) => {
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getDate() === n.getDate() &&
    d.getMonth() === n.getMonth() &&
    d.getFullYear() === n.getFullYear()
  );
};

const fmt = (s: number) =>
  `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(
    Math.max(0, s) % 60,
  ).padStart(2, "0")}`;

// ---------- persistencia en archivo local ----------

type AnyHandle = any;

async function idbSetHandle(handle: AnyHandle | null) {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("next3actions", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    if (handle) store.put(handle, FILE_HANDLE_KEY);
    else store.delete(FILE_HANDLE_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function idbGetHandle(): Promise<AnyHandle | null> {
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("next3actions", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const value = await new Promise<AnyHandle | null>((res, rej) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(FILE_HANDLE_KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

function Next3Actions() {
  const [state, setState] = useState<State>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [idea, setIdea] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const handleRef = useRef<AnyHandle | null>(null);

  const fsSupported = typeof window !== "undefined" && "showSaveFilePicker" in window;

  // carga inicial: archivo vinculado > localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State | null = null;
      const handle = await idbGetHandle();
      if (handle) {
        try {
          const perm = await handle.queryPermission?.({ mode: "readwrite" });
          if (perm === "granted") {
            const file = await handle.getFile();
            const text = await file.text();
            if (text.trim()) next = JSON.parse(text) as State;
            handleRef.current = handle;
            setFileName(handle.name);
          } else {
            handleRef.current = handle;
            setFileName(handle.name);
          }
        } catch {
          /* ignoramos, usamos localStorage */
        }
      }
      if (!next) {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          try {
            next = JSON.parse(raw) as State;
          } catch {
            next = null;
          }
        }
      }
      if (!cancelled) {
        if (next) {
          setState({
            tasks: (next.tasks ?? []).map((t) => ({ ...t, running: false })),
            parking: next.parking ?? [],
            completed: next.completed ?? [],
          });
        }
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // guardado automático
  useEffect(() => {
    if (!loaded) return;
    const payload = JSON.stringify(state, null, 2);
    localStorage.setItem(LS_KEY, payload);
    const handle = handleRef.current;
    if (!handle) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const perm = await handle.queryPermission?.({ mode: "readwrite" });
        if (perm !== "granted") return;
        const writable = await handle.createWritable();
        await writable.write(payload);
        await writable.close();
      } catch {
        if (!cancelled) toast.error("No se ha podido escribir en el archivo vinculado.");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [state, loaded]);

  // temporizadores
  useEffect(() => {
    const anyRunning = state.tasks.some((t) => t.running && t.remaining > 0);
    if (!anyRunning) return;
    const interval = setInterval(() => {
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.running && t.remaining > 0
            ? { ...t, remaining: t.remaining - 1, running: t.remaining - 1 > 0 }
            : t,
        ),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.tasks]);

  const patch = useCallback((id: string, p: Partial<Task>) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  }, []);

  const addTask = (action = "", outcome = "") =>
    setState((s) =>
      s.tasks.length >= 3 ? s : { ...s, tasks: [...s.tasks, newTask(action, outcome)] },
    );

  const removeTask = (id: string) =>
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));

  const completeTask = (id: string) => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    setJustDone(id);
    setTimeout(() => {
      setJustDone(null);
      setState((s) => ({
        ...s,
        tasks: s.tasks.filter((t) => t.id !== id),
        completed: [
          ...s.completed,
          {
            id: task.id,
            action: task.action || "Tarea sin título",
            outcome: task.outcome,
            completedAt: Date.now(),
          },
        ],
      }));
    }, 600);
  };

  const addIdea = () => {
    const text = idea.trim();
    if (!text) return;
    setState((s) => ({ ...s, parking: [{ id: uid(), text }, ...s.parking] }));
    setIdea("");
  };

  const promote = (id: string) => {
    setState((s) => {
      if (s.tasks.length >= 3) return s;
      const item = s.parking.find((p) => p.id === id);
      if (!item) return s;
      return {
        ...s,
        parking: s.parking.filter((p) => p.id !== id),
        tasks: [...s.tasks, newTask(item.text)],
      };
    });
  };

  const todayDone = useMemo(
    () => state.completed.filter((c) => isToday(c.completedAt)),
    [state.completed],
  );

  const markdown = useMemo(
    () =>
      todayDone.length
        ? `## Hecho el ${new Date().toLocaleDateString("es-ES")}\n\n` +
          todayDone
            .map((c) => `- [x] ${c.action}${c.outcome ? ` — _${c.outcome}_` : ""}`)
            .join("\n")
        : "Hoy todavía no hay tareas completadas.",
    [todayDone],
  );

  const linkFile = async () => {
    if (!fsSupported) {
      toast.error("Tu navegador no permite vincular archivos. Usa Chrome o Edge.");
      return;
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: "next-3-actions.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      handleRef.current = handle;
      setFileName(handle.name);
      await idbSetHandle(handle);
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
      toast.success(`Guardando en ${handle.name}`);
    } catch {
      /* cancelado por el usuario */
    }
  };

  const unlinkFile = async () => {
    handleRef.current = null;
    setFileName(null);
    await idbSetHandle(null);
    toast.success("Archivo desvinculado. Se sigue guardando en el navegador.");
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    toast.success("Copiado al portapapeles");
  };

  const clearDay = () => {
    setState((s) => ({ ...s, completed: s.completed.filter((c) => !isToday(c.completedAt)) }));
    setSummaryOpen(false);
    toast.success("Jornada cerrada. El parking lot se mantiene intacto.");
  };

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <Toaster />
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Next 3 Actions</h1>
              <p className="text-xs text-muted-foreground">
                Máximo tres acciones. Todo se guarda en tu equipo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fileName ? unlinkFile : linkFile}>
              <FileJson className="size-4" />
              {fileName ? `Vinculado: ${fileName}` : "Vincular archivo local"}
            </Button>
            <Button size="sm" onClick={() => setSummaryOpen(true)}>
              <Sunset className="size-4" />
              Cerrar jornada
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_320px]">
        {/* Zona de foco */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Zona de foco · {state.tasks.length}/3
            </h2>
            {state.tasks.length < 3 && (
              <Button variant="outline" size="sm" onClick={() => addTask()}>
                <Plus className="size-4" />
                Añadir acción
              </Button>
            )}
          </div>

          {state.tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-background/60 p-10 text-center text-sm text-muted-foreground">
              Nada en marcha. Añade tu primera acción y empieza a trabajar.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.tasks.map((task) => {
              const finished = task.remaining === 0;
              return (
                <article
                  key={task.id}
                  className={[
                    "flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm transition-colors",
                    finished ? "animate-pulse border-primary/70 bg-primary/5" : "border-border",
                    justDone === task.id ? "scale-[0.98] border-emerald-500/60 bg-emerald-500/10" : "",
                  ].join(" ")}
                >
                  <Input
                    value={task.action}
                    onChange={(e) => patch(task.id, { action: e.target.value })}
                    placeholder="Revisar informes de bajas y sustituciones"
                    className="border-0 px-0 text-base font-medium shadow-none focus-visible:ring-0"
                  />
                  <Input
                    value={task.outcome}
                    onChange={(e) => patch(task.id, { outcome: e.target.value })}
                    placeholder="Resultado visible: cuadrante semanal cerrado"
                    className="border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
                  />

                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="flex gap-1">
                      {[15, 30, 45].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            patch(task.id, { minutes: m, remaining: m * 60, running: false })
                          }
                          className={[
                            "rounded-md px-2 py-1 text-xs transition-colors",
                            task.minutes === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70",
                          ].join(" ")}
                        >
                          {m}′
                        </button>
                      ))}
                    </div>
                    <span className="font-mono text-lg tabular-nums">{fmt(task.remaining)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        patch(task.id, {
                          running: !task.running,
                          remaining: task.remaining > 0 ? task.remaining : task.minutes * 60,
                        })
                      }
                    >
                      {task.running ? <Pause className="size-4" /> : <Play className="size-4" />}
                      {task.running ? "Pausar" : "Empezar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reiniciar temporizador"
                      onClick={() =>
                        patch(task.id, { remaining: task.minutes * 60, running: false })
                      }
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Descartar tarjeta"
                      onClick={() => removeTask(task.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => completeTask(task.id)}
                    >
                      {justDone === task.id ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Completar
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          {todayDone.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4">
              <h3 className="mb-2 text-sm font-medium">Completadas hoy · {todayDone.length}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {todayDone.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="line-through">{c.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Parking lot */}
        <aside className="space-y-3 rounded-xl border border-border bg-background p-4 h-fit">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Parking lot</h2>
          </div>
          <div className="flex gap-2">
            <Input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addIdea()}
              placeholder="Vuelca una idea suelta…"
            />
            <Button size="icon" onClick={addIdea} aria-label="Añadir idea">
              <Plus className="size-4" />
            </Button>
          </div>
          {state.parking.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aquí van las ideas que no deben distraerte ahora.
            </p>
          ) : (
            <ul className="space-y-2">
              {state.parking.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-sm"
                >
                  <span className="flex-1 break-words">{p.text}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Promocionar a la zona de foco"
                    disabled={state.tasks.length >= 3}
                    onClick={() => promote(p.id)}
                  >
                    <ArrowUpRight className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Eliminar"
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        parking: s.parking.filter((x) => x.id !== p.id),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resumen del día</DialogTitle>
            <DialogDescription>
              Has completado {todayDone.length}{" "}
              {todayDone.length === 1 ? "tarea" : "tareas"} hoy.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
            {markdown}
          </pre>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={copyMarkdown}>
              <Copy className="size-4" />
              Copiar
            </Button>
            <Button onClick={clearDay}>
              <Sunset className="size-4" />
              Limpiar día
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
