import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ClipboardPaste, Upload, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { summarizeMeeting } from "@/lib/ai.functions";
import { saveMeeting, type Meeting } from "@/lib/idb";
import { getDirHandle, writeMeetingToFolder } from "@/lib/folder";
import { addCardsToInbox } from "@/lib/tasks";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar transcripción — Brain2ai" },
      {
        name: "description",
        content:
          "Pega o sube la transcripción de una reunión de Teams, Meet o Zoom y genera el acta con tareas, sin necesidad de grabar.",
      },
      { property: "og:title", content: "Importar transcripción — Brain2ai" },
      {
        property: "og:description",
        content:
          "Convierte transcripciones de Teams, Meet o Zoom en un acta estructurada con tareas, todo en tu ordenador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Importar,
});

const STYLES = [
  "Reunión de trabajo",
  "Reunión con cliente",
  "Entrevista",
  "Clase o formación",
  "Sesión 1:1",
];

/** Convierte VTT/SRT (Teams, Meet, Zoom) en texto legible "Hablante: frase". */
export function cleanTranscript(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let last = "";
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (l === "WEBVTT" || l.startsWith("NOTE ") || /^\d+$/.test(l)) continue;
    if (/^[\d:.,]+\s*-->\s*[\d:.,]+/.test(l)) continue;
    const text = l
      .replace(/<[^>]+>/g, "")
      .replace(/^\[[\d:.,\s]+\]\s*/, "")
      .trim();
    if (!text || text === last) continue;
    last = text;
    out.push(text);
  }
  return out.join("\n");
}

function Importar() {
  const doSummarize = useServerFn(summarizeMeeting);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [style, setStyle] = useState(STYLES[0]!);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const raw = await file.text();
      setText(cleanTranscript(raw));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success("Transcripción cargada");
    } catch {
      toast.error("No se pudo leer el archivo");
    }
  }

  async function generate() {
    const transcript = cleanTranscript(text);
    if (transcript.length < 20) {
      toast.error("Pega primero la transcripción de la reunión.");
      return;
    }
    setBusy(true);
    try {
      const res = await doSummarize({ data: { transcript, notes: "", style } });
      const meeting: Meeting = {
        id: crypto.randomUUID(),
        title: title.trim() || `Transcripción importada ${new Date().toLocaleDateString("es-ES")}`,
        createdAt: Date.now(),
        durationMs: 0,
        transcript,
        summary: res.summary,
        notes: [],
      };
      await saveMeeting(meeting);
      const dir = await getDirHandle();
      if (dir) {
        try {
          await writeMeetingToFolder(dir, meeting);
        } catch {
          /* la carpeta es opcional */
        }
      }
      if (res.tasks.length) {
        const n = await addCardsToInbox(res.tasks);
        if (n) toast.success(`${n} tareas enviadas a la Bandeja de Entrada`);
      }
      toast.success("Acta creada a partir de la transcripción");
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el acta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <Toaster />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardPaste className="size-6 text-primary" />
          Importar transcripción
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pega el texto de una reunión de Teams, Meet o Zoom (o sube el archivo .txt, .vtt o .srt) y
          genera el acta con sus tareas, sin necesidad de grabar.
        </p>
      </header>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          <Input
            className="min-w-56 flex-1"
            placeholder="Título de la reunión"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger className="w-56">
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
        </div>

        <Textarea
          className="min-h-72 font-mono text-sm"
          placeholder="Pega aquí la transcripción…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.vtt,.srt,.md,text/plain"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" />
            Subir archivo
          </Button>
          <Button onClick={() => void generate()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {busy ? "Redactando el acta…" : "Generar acta"}
          </Button>
          {text.trim() ? (
            <span className="text-xs text-muted-foreground">
              {text.trim().split(/\s+/).length} palabras
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
