import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Flag,
  Trash2,
  Download,
  FileText,
  FileType,
  Sparkles,
  Send,
  Loader2,
  Search,
  Upload,
  ListTodo,
} from "lucide-react";
import { marked } from "marked";
import { exportPdf, exportWordDoc } from "@/lib/export-doc";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { summarizeMeeting, askMeeting, transcribeChunk } from "@/lib/ai.functions";
import {
  deleteMeeting,
  formatDuration,
  listMeetings,
  saveMeeting,
  type Meeting,
} from "@/lib/idb";
import { startRecording, fileToWavChunks, type RecorderHandle } from "@/lib/recorder";
import { clearVoiceSample, getVoiceSample, recordVoiceSample } from "@/lib/voice";
import { getDirHandle, writeMeetingToFolder } from "@/lib/folder";
import { addCardsToInbox } from "@/lib/tasks";
import type { ExtractedTask } from "@/lib/tasks-parse";

/** Contenido del acta (y transcripción) como HTML para exportar a PDF/Word. */
function meetingExportHtml(m: Meeting): string {
  let body = marked.parse(m.summary || m.transcript, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string;
  if (m.summary && m.transcript) {
    const esc = m.transcript
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    body += `\n<h2>Transcripción</h2>\n<p style="white-space: pre-wrap;">${esc}</p>`;
  }
  return body;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brain2ai — graba reuniones y genera el acta con tu IA" },
      {
        name: "description",
        content:
          "Graba tus reuniones, transcríbelas y obtén el acta con tareas y decisiones. Todo se guarda en tu propio ordenador, sin base de datos.",
      },
      { property: "og:title", content: "Brain2ai — reuniones grabadas y resumidas en tu equipo" },
      {
        property: "og:description",
        content:
          "Grabadora de reuniones con transcripción y acta automática. Audio y texto guardados solo en tu ordenador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STYLES = [
  "Reunión de trabajo",
  "Reunión con cliente",
  "Entrevista",
  "Clase o formación",
  "Sesión 1:1",
];

function Index() {
  const doSummarize = useServerFn(summarizeMeeting);
  const doAsk = useServerFn(askMeeting);
  const doTranscribe = useServerFn(transcribeChunk);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState(STYLES[0]!);
  const [keepAudio, setKeepAudio] = useState(true);
  const [speakers, setSpeakers] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [notes, setNotes] = useState<{ t: number; text: string }[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tasksById, setTasksById] = useState<Record<string, ExtractedTask[]>>({});

  const handleRef = useRef<RecorderHandle | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const liveRef = useRef("");
  const dirRef = useRef<any>(null);
  const [folderName, setFolderName] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const h = await getDirHandle();
      dirRef.current = h;
      setFolderName(h?.name ?? null);
    };
    void load();
    window.addEventListener("acta-folder", load);
    return () => window.removeEventListener("acta-folder", load);
  }, []);

  useEffect(() => {
    const has = !!getVoiceSample();
    setHasVoice(has);
    if (has) setSpeakers(true);
  }, []);

  async function calibrate() {
    setCalibrating(true);
    try {
      await recordVoiceSample(8, setLevel);
      setHasVoice(true);
      toast.success("Tu voz quedó guardada en este ordenador");
    } catch {
      toast.error("No se pudo grabar tu voz. Revisa los permisos del micrófono.");
    } finally {
      setLevel(0);
      setCalibrating(false);
    }
  }

  async function syncToFolder(m: Meeting) {
    const dir = dirRef.current;
    if (!dir) return;
    try {
      await writeMeetingToFolder(dir, m);
    } catch {
      toast.error("No se pudo escribir en la carpeta elegida.");
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
        const sample = speakers ? (getVoiceSample() ?? undefined) : undefined;
        const res = await doTranscribe({
          data: { audio, ...(sample ? { sample } : {}), speakers },
        });
        const text = res.text.trim();
        if (text) {
          liveRef.current = `${liveRef.current} ${text}`.trim();
          setLiveText(liveRef.current);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falló la transcripción de un fragmento");
      }
    });
  }

  const refresh = useCallback(async () => {
    setMeetings(await listMeetings());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(handleRef.current?.elapsed() ?? 0), 500);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    try {
      liveRef.current = "";
      chainRef.current = Promise.resolve();
      setLiveText("");
      setNotes([]);
      setAnswer("");
      handleRef.current = await startRecording({
        onLevel: setLevel,
        onChunk: (wav) => enqueueChunk(wav),
      });
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  async function stop() {
    const handle = handleRef.current;
    if (!handle) return;
    setRecording(false);
    setBusy("Cerrando la grabación…");
    const { audio, audioType, durationMs } = await handle.stop();
    handleRef.current = null;
    setBusy("Transcribiendo los últimos fragmentos…");
    await chainRef.current;
    setLiveText(liveRef.current);
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      title: title.trim() || `Reunión ${new Date().toLocaleString("es-ES")}`,
      createdAt: Date.now(),
      durationMs,
      transcript: liveRef.current,
      summary: "",
      notes,
      ...(keepAudio ? { audio, audioType } : {}),
    };
    await saveMeeting(meeting);
    await syncToFolder(meeting);
    setTitle("");
    setBusy(null);
    await refresh();
    setSelectedId(meeting.id);
    toast.success("Reunión guardada en tu ordenador");
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setBusy("Transcribiendo el audio subido…");
    try {
      liveRef.current = "";
      chainRef.current = Promise.resolve();
      setLiveText("");
      setAnswer("");
      const { chunks, durationMs } = await fileToWavChunks(file);
      for (const c of chunks) enqueueChunk(c);
      await chainRef.current;
      const meeting: Meeting = {
        id: crypto.randomUUID(),
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        createdAt: Date.now(),
        durationMs,
        transcript: liveRef.current,
        summary: "",
        notes: [],
        ...(keepAudio ? { audio: file, audioType: file.type || "audio/*" } : {}),
      };
      await saveMeeting(meeting);
      await syncToFolder(meeting);
      setTitle("");
      await refresh();
      setSelectedId(meeting.id);
      toast.success("Audio transcrito y guardado en tu ordenador");
    } catch {
      toast.error("No se pudo procesar ese archivo de audio.");
    } finally {
      setBusy(null);
    }
  }

  async function makeSummary(m: Meeting) {
    if (!m.transcript.trim()) {
      toast.error("Esta reunión no tiene transcripción.");
      return;
    }
    setBusy("Redactando el acta…");
    try {
      const res = await doSummarize({
        data: {
          transcript: m.transcript,
          notes: m.notes.map((n) => `[${formatDuration(n.t)}] ${n.text}`).join("\n"),
          style,
        },
      });
      await saveMeeting({ ...m, summary: res.summary });
      await syncToFolder({ ...m, summary: res.summary });
      await refresh();
      setTasksById((prev) => ({ ...prev, [m.id]: res.tasks }));
      if (res.tasks.length) {
        const n = await addCardsToInbox(res.tasks);
        if (n) toast.success(`${n} tareas enviadas a la Bandeja de Entrada`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el acta");
    } finally {
      setBusy(null);
    }
  }

  async function extractTasks(m: Meeting) {
    setBusy("Buscando tareas en la reunión…");
    try {
      let tasks = tasksById[m.id];
      if (!tasks) {
        const res = await doSummarize({
          data: {
            transcript: m.transcript,
            notes: m.notes.map((n) => `[${formatDuration(n.t)}] ${n.text}`).join("\n"),
            style,
          },
        });
        tasks = res.tasks;
        setTasksById((prev) => ({ ...prev, [m.id]: res.tasks }));
      }
      const n = await addCardsToInbox(tasks);
      if (n) toast.success(`${n} tareas enviadas a la Bandeja de Entrada`);
      else toast("No se encontraron acciones concretas en esta reunión.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron extraer las tareas");
    } finally {
      setBusy(null);
    }
  }

  async function ask(m: Meeting) {
    if (!question.trim()) return;
    setBusy("Buscando en la transcripción…");
    try {
      const res = await doAsk({ data: { transcript: m.transcript, question } });
      setAnswer(res.answer);
      setQuestion("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo responder");
    } finally {
      setBusy(null);
    }
  }

  function download(name: string, content: string | Blob, type = "text/markdown") {
    const blob = typeof content === "string" ? new Blob([content], { type }) : content;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = meetings.find((m) => m.id === selectedId) ?? null;
  const filtered = meetings.filter((m) =>
    query.trim()
      ? `${m.title} ${m.transcript} ${m.summary}`.toLowerCase().includes(query.toLowerCase())
      : true,
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[340px_1fr]">
        {/* Panel izquierdo */}
        <section className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Nueva grabación
              </h2>
              {recording && (
                <Badge variant="destructive" className="animate-pulse">
                  REC {formatDuration(elapsed)}
                </Badge>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <Input
                placeholder="Título de la reunión"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={recording}
              />
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={keepAudio}
                  onChange={(e) => setKeepAudio(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Guardar también el audio (unos 15 MB por hora)
              </label>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={speakers}
                  onChange={(e) => setSpeakers(e.target.checked)}
                  className="size-4 accent-primary"
                  disabled={recording}
                />
                Marcar quién habla en cada frase
              </label>

              {speakers && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  {hasVoice ? (
                    <>
                      Tu voz está grabada: lo que digas tú se marcará como{" "}
                      <span className="font-medium text-foreground">Yo</span> y el resto como
                      Hablante 2, 3…
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={calibrating || recording}
                          onClick={() => void calibrate()}
                        >
                          Volver a grabar mi voz
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={calibrating || recording}
                          onClick={() => {
                            clearVoiceSample();
                            setHasVoice(false);
                          }}
                        >
                          Borrar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      Graba 8 segundos hablando tú para que la IA distinga tu voz. Sin esto solo
                      separará Hablante 1, 2, 3…
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full"
                        disabled={calibrating || recording}
                        onClick={() => void calibrate()}
                      >
                        {calibrating ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" /> Habla ahora…
                          </>
                        ) : (
                          "Grabar mi voz (8 s)"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}


              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.round(level * 180))}%` }}
                />
              </div>

              {!recording ? (
                <>
                  <Button className="w-full" onClick={() => void start()} disabled={!!busy}>
                    <Mic className="mr-2 size-4" /> Empezar a grabar
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={!!busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 size-4" /> Subir un audio
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    ¿Tienes una reunión ya grabada? Súbela y se transcribe igual.
                  </p>
                </>
              ) : (
                <Button variant="destructive" className="w-full" onClick={() => void stop()}>
                  <Square className="mr-2 size-4" /> Parar y guardar
                </Button>
              )}

              {recording && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nota rápida…"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && noteDraft.trim()) {
                        setNotes((n) => [
                          ...n,
                          { t: handleRef.current?.elapsed() ?? 0, text: noteDraft.trim() },
                        ]);
                        setNoteDraft("");
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!noteDraft.trim()) return;
                      setNotes((n) => [
                        ...n,
                        { t: handleRef.current?.elapsed() ?? 0, text: noteDraft.trim() },
                      ]);
                      setNoteDraft("");
                    }}
                  >
                    <Flag className="size-4" />
                  </Button>
                </div>
              )}

              {notes.length > 0 && recording && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {notes.map((n, i) => (
                    <li key={i}>
                      <span className="text-primary">{formatDuration(n.t)}</span> · {n.text}
                    </li>
                  ))}
                </ul>
              )}

              {recording && (
                <div className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                  {liveText || "La transcripción irá apareciendo por fragmentos mientras hablas…"}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en mis reuniones"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {filtered.length === 0 && (
                <li className="text-xs text-muted-foreground">Aún no hay reuniones guardadas.</li>
              )}
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      setSelectedId(m.id);
                      setAnswer("");
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      selectedId === m.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <div className="truncate text-sm font-medium">{m.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString("es-ES")} ·{" "}
                      {formatDuration(m.durationMs)}
                      {m.audio ? " · audio" : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Detalle */}
        <section className="rounded-xl border border-border bg-card p-6">
          {busy && (
            <div className="mb-4 flex items-center gap-2 text-sm text-primary">
              <Loader2 className="size-4 animate-spin" /> {busy}
            </div>
          )}

          {!selected ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Mic className="mb-3 size-8 text-primary" />
              Graba una reunión o elige una de la lista para ver su acta.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.createdAt).toLocaleString("es-ES")} ·{" "}
                    {formatDuration(selected.durationMs)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void makeSummary(selected)} disabled={!!busy}>
                    <Sparkles className="mr-2 size-4" />
                    {selected.summary ? "Rehacer acta" : "Generar acta"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      download(
                        `${selected.title}.md`,
                        `# ${selected.title}\n\n${selected.summary || selected.transcript}`,
                      )
                    }
                  >
                    <Download className="mr-2 size-4" /> Descargar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Guardar como PDF"
                    onClick={() => {
                      if (!exportPdf(selected.title, meetingExportHtml(selected)))
                        toast.error("El navegador bloqueó la ventana. Permite las ventanas emergentes.");
                    }}
                  >
                    <FileText className="mr-2 size-4" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Descargar para Word"
                    onClick={() => exportWordDoc(selected.title, meetingExportHtml(selected))}
                  >
                    <FileType className="mr-2 size-4" /> Word
                  </Button>
                  {selected.audio && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await saveMeeting({ ...selected, audio: undefined });
                        await refresh();
                        toast.success("Audio borrado, el texto se conserva");
                      }}
                    >
                      Borrar audio
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteMeeting(selected.id);
                      setSelectedId(null);
                      await refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {selected.audio && (
                <audio
                  controls
                  className="w-full"
                  src={URL.createObjectURL(selected.audio)}
                  key={selected.id}
                />
              )}

              <Tabs defaultValue="acta">
                <TabsList>
                  <TabsTrigger value="acta">Acta</TabsTrigger>
                  <TabsTrigger value="transcripcion">Transcripción</TabsTrigger>
                  <TabsTrigger value="preguntar">Preguntar</TabsTrigger>
                </TabsList>

                <TabsContent value="acta">
                  {selected.summary ? (
                    <article className="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
                      {selected.summary}
                    </article>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      Todavía no hay acta. Pulsa «Generar acta».
                    </p>
                  )}
                  {selected.notes.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {selected.notes.map((n, i) => (
                        <li key={i}>
                          <span className="text-primary">{formatDuration(n.t)}</span> · {n.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {selected.transcript.trim() && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => void extractTasks(selected)}
                      >
                        <ListTodo className="mr-2 size-4" /> Extraer tareas al Kanban
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Las tareas llegan a la Bandeja de entrada (IA) del tablero, listas para
                        revisarlas y moverlas.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="transcripcion">
                  <Textarea
                    value={selected.transcript}
                    onChange={(e) => void saveMeeting({ ...selected, transcript: e.target.value })}
                    onBlur={() => void refresh()}
                    className="min-h-[320px] text-sm leading-relaxed"
                    placeholder="Sin transcripción"
                  />
                </TabsContent>

                <TabsContent value="preguntar">
                  <div className="flex gap-2">
                    <Input
                      placeholder="¿Qué se acordó sobre el presupuesto?"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void ask(selected)}
                    />
                    <Button onClick={() => void ask(selected)} disabled={!!busy}>
                      <Send className="size-4" />
                    </Button>
                  </div>
                  {answer && (
                    <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
                      {answer}
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
