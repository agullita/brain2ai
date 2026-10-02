import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FolderOpen, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  PROVIDER_LABEL,
  getAiProvider,
  getCfAccountId,
  getAiKey,
  providerReady,
  saveSettingsToFolder,
  setAiAccountId,
  setAiKey,
  setAiProvider,
  syncSettingsWithFolder,
  type AiProvider,
} from "@/lib/apiKey";
import { testConnection } from "@/lib/ai.functions";

const PROVIDERS: AiProvider[] = ["gemini", "openai", "cloudflare"];

/**
 * Diálogo de ajustes de IA: elige el proveedor y guarda sus credenciales.
 * Se guardan en el navegador y, si hay carpeta local, en su `ajustes.json`.
 */
export function ApiKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [value, setValue] = useState("");
  const [accountId, setAccountId] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const doTest = useServerFn(testConnection);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setAccountId("");
    void (async () => {
      const { getDirHandle } = await import("@/lib/folder");
      const dir = await getDirHandle();
      setFolderName(dir?.name ?? null);
      await syncSettingsWithFolder();
      const current = getAiProvider();
      setProvider(current);
      setHasKey(providerReady(current));
    })();
  }, [open]);

  function choose(next: AiProvider) {
    setProvider(next);
    setValue("");
    setAccountId("");
    setHasKey(providerReady(next));
  }

  async function test() {
    const k = value.trim() || getAiKey(provider);
    const acc = provider === "cloudflare" ? accountId.trim() || getCfAccountId() : null;
    if (!k) {
      toast.error(`Escribe primero tus credenciales de ${PROVIDER_LABEL[provider]}`);
      return;
    }
    if (provider === "cloudflare" && !acc) {
      toast.error("Escribe tu Account ID de Cloudflare");
      return;
    }
    setTesting(true);
    try {
      const res = await doTest({
        data: {
          provider,
          ...(k ? { apiKey: k } : {}),
          ...(acc ? { accountId: acc } : {}),
        },
      });
      toast.success(`Conexión correcta con ${PROVIDER_LABEL[provider]} · respuesta: “${res.text}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    const k = value.trim();
    const cfId = accountId.trim();

    if (provider === "cloudflare") {
      if (!k && !getAiKey("cloudflare")) {
        toast.error("Escribe tu API Token de Cloudflare");
        return;
      }
      if (!cfId && !getCfAccountId()) {
        toast.error("Escribe tu Account ID de Cloudflare");
        return;
      }
    } else if (!k && !getAiKey(provider)) {
      toast.error(`Escribe tu clave de ${PROVIDER_LABEL[provider]}`);
      return;
    }

    setBusy(true);
    setAiProvider(provider);
    if (k) setAiKey(provider, k);
    if (provider === "cloudflare" && cfId) setAiAccountId("cloudflare", cfId);
    const savedToFolder = await saveSettingsToFolder();
    setBusy(false);
    setValue("");
    setAccountId("");
    setHasKey(providerReady(provider));
    onOpenChange(false);
    toast.success(
      savedToFolder
        ? `Ajustes de ${PROVIDER_LABEL[provider]} guardados en tu carpeta (${folderName ?? "ajustes.json"})`
        : `Ajustes de ${PROVIDER_LABEL[provider]} guardados en este navegador`,
    );
  }

  async function remove() {
    setBusy(true);
    setAiKey(provider, null);
    setAiAccountId(provider, null);
    await saveSettingsToFolder();
    setBusy(false);
    setHasKey(false);
    toast(`Credenciales de ${PROVIDER_LABEL[provider]} borradas`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Clave de IA
          </DialogTitle>
          <DialogDescription>
            Elige el proveedor y guarda sus credenciales. Se usarán para transcribir, resumir,
            extraer tareas y redactar correos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                provider === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {PROVIDER_LABEL[p]}
              {providerReady(p) ? " ✓" : ""}
            </button>
          ))}
        </div>

        {provider === "cloudflare" && (
          <Input
            type="text"
            autoComplete="off"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder={
              getCfAccountId()
                ? "Account ID guardado · escribe otro para cambiarlo"
                : "Account ID de Cloudflare"
            }
          />
        )}

        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder={
            hasKey
              ? `Credencial de ${PROVIDER_LABEL[provider]} guardada · escribe otra para cambiarla`
              : provider === "cloudflare"
                ? "API Token de Cloudflare"
                : `Pega aquí tu clave de ${PROVIDER_LABEL[provider]}`
          }
        />

        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <FolderOpen className="mt-0.5 size-3.5 shrink-0" />
          {folderName ? (
            <span>
              Se guardará en la carpeta{" "}
              <span className="font-medium text-foreground">{folderName}</span> (archivo{" "}
              <span className="font-mono">ajustes.json</span>) y en este navegador.
            </span>
          ) : (
            <span>
              Se guardará en este navegador. Si eliges una carpeta local en el menú, también se
              guardará ahí como <span className="font-mono">ajustes.json</span>.
            </span>
          )}
        </p>

        {provider === "openai" && (
          <p className="text-xs text-muted-foreground">
            OpenAI transcribe con Whisper: no separa hablantes ni reconoce tu voz (eso solo lo hace
            Gemini). Las actas, tareas y correos funcionan igual.
          </p>
        )}

        {provider === "cloudflare" && (
          <p className="text-xs text-muted-foreground">
            Cloudflare Workers AI es gratis: 10.000 neurons/día (~3,5 h de transcripción). Consigue
            el Account ID en el panel y un API Token con permiso «Workers AI». Whisper no separa
            hablantes.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {hasKey ? (
            <Button variant="ghost" onClick={() => void remove()} disabled={busy || testing}>
              Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void test()} disabled={busy || testing}>
              {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Probar
            </Button>
            <Button onClick={() => void save()} disabled={busy || testing}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
