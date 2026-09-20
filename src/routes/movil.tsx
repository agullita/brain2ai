import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Square, Share2, Download, Mail, Trash2, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import logoUrl from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { formatDuration, listMeetings, deleteMeeting, saveMeeting, type Meeting } from "@/lib/idb";
import { startRecording, type RecorderHandle } from "@/lib/recorder";

export const Route = createFileRoute("/movil")({
  head: () => ({
    meta: [
      { title: "Grabadora móvil — Brain2ai" },
      {
        name: "description",
        content:
          "Graba la reunión desde el móvil y envía el audio por WhatsApp, Telegram o correo para hacer el acta en el ordenador.",
      },
      { property: "og:title", content: "Grabadora móvil — Brain2ai" },
      {
        property: "og:description",
        content: "Graba desde el móvil y manda el audio a tu ordenador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Movil,
});

function mmss(ms: number) {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function ext(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  return "audio";
}

function Movil() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [items, setItems] = useState<Meeting[]>([]);
  const handleRef = useRef<RecorderHandle | null>(null);

  useEffect(() => {
    void listMeetings().then((all) => setItems(all.filter((m) => m.audio)));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(handleRef.current?.elapsed() ?? 0), 500);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    try {
      handleRef.current = await startRecording({ onLevel: setLevel });
      setElapsed(0);
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono. Permite el acceso y vuelve a intentarlo.");
    }
  }

  async function stop() {
    const handle = handleRef.current;
    if (!handle) return;
    setRecording(false);
    setLevel(0);
    const res = await handle.stop();
    handleRef.current = null;
    const date = new Date();
    const meeting: Meeting = {
      id: `${date.getTime()}`,
      title: `Grabación — ${date.toLocaleDateString("es-ES")} ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
      createdAt: date.getTime(),
      durationMs: res.durationMs,
      transcript: "",
      summary: "",
      notes: [],
      audio: res.audio,
      audioType: res.audioType,
    };
    await saveMeeting(meeting);
    setItems((prev) => [meeting, ...prev]);
    toast.success("Grabación guardada en el móvil");
  }

  function fileOf(m: Meeting) {
    const type = m.audioType || "audio/webm";
    return new File([m.audio as Blob], `reunion-${m.id}.${ext(type)}`, { type });
  }

  async function share(m: Meeting) {
    const file = fileOf(m);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: m.title, text: m.title });
      } catch {
        /* el usuario canceló */
      }
      return;
    }
    download(m);
    toast.info("Tu navegador no puede compartir el archivo: se ha descargado para que lo adjuntes.");
  }

  function download(m: Meeting) {
    const url = URL.createObjectURL(fileOf(m));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileOf(m).name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function remove(m: Meeting) {
    await deleteMeeting(m.id);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <img src={logoUrl} alt="Brain2ai" width={36} height={36} className="size-9" />
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold leading-tight">Grabadora</h1>
          <p className="text-xs text-muted-foreground">Graba y envíalo a tu ordenador</p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-display text-4xl tabular-nums">{mmss(elapsed)}</p>
        <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.round(level * 180))}%` }}
          />
        </div>
        <Button
          size="lg"
          className="mt-6 h-16 w-full rounded-xl text-base"
          variant={recording ? "destructive" : "default"}
          onClick={() => void (recording ? stop() : start())}
        >
          {recording ? (
            <>
              <Square className="mr-2 size-5" /> Detener grabación
            </>
          ) : (
            <>
              <Mic className="mr-2 size-5" /> Empezar a grabar
            </>
          )}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Mantén la pantalla encendida mientras grabas.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Grabaciones ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has grabado nada.</p>
        ) : (
          items.map((m) => (
            <article key={m.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDuration(m.durationMs)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => void remove(m)} title="Borrar">
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <audio
                controls
                className="mt-3 w-full"
                src={m.audio ? URL.createObjectURL(m.audio) : undefined}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button onClick={() => void share(m)}>
                  <Share2 className="mr-2 size-4" /> Enviar audio
                </Button>
                <Button variant="outline" onClick={() => download(m)}>
                  <Download className="mr-2 size-4" /> Descargar
                </Button>
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(m.title)}`}>WhatsApp</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`https://t.me/share/url?url=&text=${encodeURIComponent(m.title)}`}>
                    Telegram
                  </a>
                </Button>
                <Button variant="outline" className="col-span-2" asChild>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(m.title)}&body=${encodeURIComponent("Adjunto el audio de la reunión.")}`}
                  >
                    <Mail className="mr-2 size-4" /> Correo
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                "Enviar audio" abre el menú de compartir del móvil con el archivo ya adjunto
                (WhatsApp, Telegram, correo…). Los botones sueltos abren la app, pero tendrás que
                adjuntar el archivo descargado a mano.
              </p>
            </article>
          ))
        )}
      </section>

      <footer className="mt-auto pt-4 text-center">
        <Link
          to="/"
          onClick={() => sessionStorage.setItem("acta-forzar-escritorio", "1")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline"
        >
          <Monitor className="size-4" /> Abrir la app completa
        </Link>
      </footer>
    </div>
  );
}
