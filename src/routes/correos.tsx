import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, KeyRound, Loader2, Mail, Plus, Settings, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getDirHandle,
  readJsonFromFolder,
  writeJsonToFolder,
} from "@/lib/folder";
import {
  KEY_CHANGED_EVENT,
  PROVIDER_LABEL,
  getActiveAccountId,
  getActiveKey,
  getAiProvider,
  openApiKeySettings,
} from "@/lib/apiKey";
import { aiChat } from "@/lib/ai.functions";

export const Route = createFileRoute("/correos")({
  component: EmailCompiler,
  head: () => ({
    meta: [
      { title: "Compilador de correos HTML — plantillas corporativas listas para pegar" },
      {
        name: "description",
        content:
          "Redacta correos corporativos en HTML con colores institucionales, ayuda de la IA y copiado con formato para Outlook. Todo se guarda en tu ordenador.",
      },
      {
        property: "og:title",
        content: "Compilador de correos HTML — plantillas corporativas listas para pegar",
      },
      {
        property: "og:description",
        content:
          "Correos corporativos en HTML con estilos en línea, colores de marca y copiado con formato. Guardado local.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const DRAFT_LS = "acta-local-correo";
const FILE_NAME = "correo.json";

type Swatch = { name: string; hex: string };

const DEFAULT_PALETTE: Swatch[] = [
  { name: "Azul Corporativo", hex: "#00529F" },
  { name: "Dorado Institucional", hex: "#FDB913" },
  { name: "Gris Texto", hex: "#53565A" },
  { name: "Blanco Fondo", hex: "#FFFFFF" },
];

type Draft = {
  subject: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  signature: string;
  color: string;
  palette: Swatch[];
  customHtml: string;
};

const EMPTY: Draft = {
  subject: "",
  heading: "",
  body: "",
  ctaText: "",
  ctaUrl: "",
  signature: "",
  color: "#00529F",
  palette: DEFAULT_PALETTE,
  customHtml: "",
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convierte el cuerpo en párrafos con estilos en línea; respeta HTML si ya lo trae. */
function bodyHtml(body: string, textColor: string) {
  const looksHtml = /<\/?(p|div|table|ul|ol|br|h[1-6]|strong|em|a)\b/i.test(body);
  if (looksHtml) return body;
  return body
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${textColor};">${esc(
          p.trim(),
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function buildHtml(d: Draft) {
  const text = "#53565A";
  const cta = d.ctaText.trim()
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
  <tr><td bgcolor="${d.color}" style="border-radius:4px;">
    <a href="${esc(d.ctaUrl || "#")}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border:1px solid ${d.color};border-radius:4px;">${esc(d.ctaText)}</a>
  </td></tr>
</table>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;border:1px solid ${d.color};border-top:4px solid ${d.color};background-color:#FFFFFF;">
   <tr><td style="padding:24px 28px 8px 28px;">
    ${d.heading.trim() ? `<h1 style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${d.color};">${esc(d.heading)}</h1>` : ""}
    ${bodyHtml(d.body, text)}
    ${cta}
    ${d.signature.trim() ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${d.color};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${text};">${esc(d.signature).replace(/\n/g, "<br />")}</p>` : ""}
   </td></tr>
  </table>
 </td></tr>
</table>`;
}

function EmailCompiler() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [prompt, setPrompt] = useState("");
  const [designPrompt, setDesignPrompt] = useState("");
  const [designBusy, setDesignBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [ready, setReady] = useState(false);
  const dirRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doChat = useServerFn(aiChat);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  }, []);

  // Carga inicial: carpeta local si existe, si no localStorage.
  useEffect(() => {
    let cancel = false;
    (async () => {
      setHasKey(Boolean(getActiveKey()));
      let loaded: Draft | null = null;
      const h = await getDirHandle();
      if (h) {
        dirRef.current = h;
        loaded = await readJsonFromFolder<Draft>(h, FILE_NAME);
      }
      if (!loaded) {
        try {
          const raw = localStorage.getItem(DRAFT_LS);
          if (raw) loaded = JSON.parse(raw) as Draft;
        } catch {
          loaded = null;
        }
      }
      if (!cancel) {
        if (loaded)
          setDraft({
            ...EMPTY,
            ...loaded,
            palette: loaded.palette?.length ? loaded.palette : DEFAULT_PALETTE,
            customHtml: loaded.customHtml ?? "",
          });
        setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Guardado automático en la carpeta local (y respaldo en el navegador).
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DRAFT_LS, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const h = dirRef.current;
      if (!h) return;
      void writeJsonToFolder(h, FILE_NAME, { ...draft, updatedAt: Date.now() }).catch(() =>
        toast.error("No se pudo escribir en la carpeta del ordenador"),
      );
    }, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, ready]);

  // La carpeta se elige desde el menú lateral; aquí solo escuchamos el cambio.
  useEffect(() => {
    const sync = async () => {
      dirRef.current = await getDirHandle();
    };
    window.addEventListener("acta-folder", sync);
    return () => window.removeEventListener("acta-folder", sync);
  }, []);

  // Si la clave se cambia desde los ajustes globales, refrescamos el estado.
  useEffect(() => {
    const syncKey = () => setHasKey(Boolean(getActiveKey()));
    window.addEventListener(KEY_CHANGED_EVENT, syncKey);
    return () => window.removeEventListener(KEY_CHANGED_EVENT, syncKey);
  }, []);

  const writeWithAi = useCallback(async () => {
    const provider = getAiProvider();
    const apiKey = getActiveKey();
    if (!apiKey) {
      toast.error(`Configura tu credencial de ${PROVIDER_LABEL[provider]} en Ajustes`);
      openApiKeySettings();
      return;
    }
    if (!prompt.trim()) {
      toast.error("Escribe primero qué quieres contar");
      return;
    }
    setBusy(true);
    try {
      const accountId = getActiveAccountId();
      const res = await doChat({
        data: {
          provider,
          apiKey,
          ...(accountId ? { accountId } : {}),
          label: "Redactar correo",
          prompt:
            "Actúa como un redactor corporativo. Escribe un correo profesional en formato HTML basado en esto: " +
            prompt,
        },
      });
      const text = res.text;
      if (!text.trim()) throw new Error("La IA no devolvió texto");
      set("body", text.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim());
      toast.success("Borrador redactado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo redactar el correo");
    } finally {
      setBusy(false);
    }
  }, [prompt, set, doChat]);

  const applyDesign = useCallback(async () => {
    const provider = getAiProvider();
    const apiKey = getActiveKey();
    if (!apiKey) {
      toast.error(`Configura tu credencial de ${PROVIDER_LABEL[provider]} en Ajustes`);
      openApiKeySettings();
      return;
    }
    if (!designPrompt.trim()) {
      toast.error("Describe el diseño o pega un correo de ejemplo");
      return;
    }
    setDesignBusy(true);
    try {
      const colors = draft.palette.map((c) => `${c.name}: ${c.hex}`).join(", ");
      const base = draft.customHtml.trim() || buildHtml(draft);
      const instruction = [
        "Eres experto en maquetar correos HTML compatibles con Outlook.",
        "Devuelve SOLO el código HTML final, sin explicaciones ni markdown.",
        'Usa tablas, todo el CSS en línea con style="...", ancho máximo 600px.',
        `Colores de marca disponibles (úsalos): ${colors}. Color principal: ${draft.color}.`,
        "Conserva el contenido del correo actual salvo que se indique lo contrario.",
        "",
        "CORREO ACTUAL:",
        base,
        "",
        "PETICIÓN DE DISEÑO (puede ser una descripción o un HTML de ejemplo a imitar):",
        designPrompt,
      ].join("\n");
      const accountId = getActiveAccountId();
      const res = await doChat({
        data: {
          provider,
          apiKey,
          ...(accountId ? { accountId } : {}),
          label: "Aplicar diseño",
          prompt: instruction,
        },
      });
      const text = res.text
        .replace(/^```html\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      if (!text) throw new Error("La IA no devolvió diseño");
      set("customHtml", text);
      toast.success("Diseño aplicado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar el diseño");
    } finally {
      setDesignBusy(false);
    }
  }, [designPrompt, draft, set, doChat]);

  const html = draft.customHtml.trim() || buildHtml(draft);

  const copyRich = useCallback(async () => {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([draft.body], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      toast.success("Correo copiado con formato: pégalo en Outlook");
    } catch {
      toast.error("Tu navegador no deja copiar con formato. Copia el código HTML.");
    }
  }, [html, draft.body]);

  const copyCode = useCallback(async () => {
    await navigator.clipboard.writeText(html);
    toast.success("Código HTML copiado");
  }, [html]);

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Correos HTML</h1>
              <p className="text-xs text-muted-foreground">
                Plantilla corporativa lista para pegar en Outlook.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettings(true)}
              title="Ajustes"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-muted-foreground" />
              Asistente de redacción
            </h2>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Instrucciones para la IA: convocar al equipo a la reunión anual, tono cercano…"
              className="min-h-24"
            />
            <Button className="mt-3 w-full" onClick={() => void writeWithAi()} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Redactar con IA
            </Button>
            {!hasKey && (
              <p className="mt-2 text-xs text-muted-foreground">
                Añade tu clave de IA (Gemini u OpenAI) en Ajustes para usar el asistente.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Color corporativo</h2>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setSettings(true)}
              >
                Editar colores
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.palette.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => set("color", c.hex)}
                  title={`${c.name} · ${c.hex}`}
                  aria-label={c.name}
                  aria-pressed={draft.color === c.hex}
                  className={`size-9 rounded-full border-2 transition-transform ${
                    draft.color === c.hex
                      ? "scale-110 border-foreground"
                      : "border-border hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {draft.palette.find((c) => c.hex === draft.color)?.name ?? "Color"} · {draft.color}
            </p>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Wand2 className="size-4 text-muted-foreground" />
              Diseño del correo
            </h2>
            <Textarea
              value={designPrompt}
              onChange={(e) => setDesignPrompt(e.target.value)}
              placeholder="Describe el diseño (más moderno, con cabecera de color, dos columnas…) o pega aquí el HTML de un correo que quieras imitar."
              className="min-h-28"
            />
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => void applyDesign()}
              disabled={designBusy}
            >
              {designBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 size-4" />
              )}
              Aplicar diseño con IA
            </Button>
            {draft.customHtml.trim() && (
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => set("customHtml", "")}
              >
                Volver a la plantilla original
              </Button>
            )}
            {draft.customHtml.trim() && (
              <p className="mt-2 text-xs text-muted-foreground">
                Estás usando un diseño personalizado: los campos de contenido ya no se aplican hasta
                que vuelvas a la plantilla.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4">
            <h2 className="text-sm font-medium">Contenido</h2>
            <Input
              value={draft.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Asunto"
            />
            <Input
              value={draft.heading}
              onChange={(e) => set("heading", e.target.value)}
              placeholder="Título del correo"
            />
            <Textarea
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Cuerpo del mensaje"
              className="min-h-48"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={draft.ctaText}
                onChange={(e) => set("ctaText", e.target.value)}
                placeholder="Texto del botón"
              />
              <Input
                value={draft.ctaUrl}
                onChange={(e) => set("ctaUrl", e.target.value)}
                placeholder="https://enlace-del-boton"
              />
            </div>
            <Textarea
              value={draft.signature}
              onChange={(e) => set("signature", e.target.value)}
              placeholder="Firma"
              className="min-h-20"
            />
          </section>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void copyRich()}>
              <Copy className="mr-2 size-4" />
              Copiar con formato
            </Button>
            <Button variant="outline" onClick={() => void copyCode()}>
              Copiar código HTML
            </Button>
          </div>
          {draft.subject && (
            <p className="text-sm">
              <span className="text-muted-foreground">Asunto:</span> {draft.subject}
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-white p-2">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </main>

      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>
              Los colores se guardan solo en este ordenador (y en tu carpeta local).
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => {
              setSettings(false);
              openApiKeySettings();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <KeyRound className="size-4" />
            {hasKey
              ? "Clave de IA configurada · cambiar proveedor o clave"
              : "Configurar tu clave de IA (Gemini u OpenAI)"}
          </button>

          <div className="space-y-2 border-t border-border/70 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Colores corporativos</h3>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => set("palette", DEFAULT_PALETTE)}
              >
                Restaurar
              </button>
            </div>
            {draft.palette.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"}
                  onChange={(e) => {
                    const next = draft.palette.map((p, j) =>
                      j === i ? { ...p, hex: e.target.value.toUpperCase() } : p,
                    );
                    set("palette", next);
                  }}
                  className="size-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                  aria-label={`Color ${c.name}`}
                />
                <Input
                  value={c.name}
                  onChange={(e) => {
                    const next = draft.palette.map((p, j) =>
                      j === i ? { ...p, name: e.target.value } : p,
                    );
                    set("palette", next);
                  }}
                  placeholder="Nombre"
                  className="h-9"
                />
                <Input
                  value={c.hex}
                  onChange={(e) => {
                    const next = draft.palette.map((p, j) =>
                      j === i ? { ...p, hex: e.target.value.toUpperCase() } : p,
                    );
                    set("palette", next);
                  }}
                  placeholder="#00529F"
                  className="h-9 w-28 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Borrar color"
                  onClick={() => set("palette", draft.palette.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                set("palette", [...draft.palette, { name: "Nuevo color", hex: "#888888" }])
              }
            >
              <Plus className="mr-2 size-4" />
              Añadir color
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettings(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
