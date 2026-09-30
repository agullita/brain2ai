import { useEffect, useState } from "react";
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
  getAiKey,
  getAiProvider,
  saveSettingsToFolder,
  setAiKey,
  setAiProvider,
  syncSettingsWithFolder,
  type AiProvider,
} from "@/lib/apiKey";

const PROVIDERS: AiProvider[] = ["gemini", "openai"];

/**
 * Diálogo de ajustes de IA: elige el proveedor (Gemini u OpenAI) y guarda su clave.
 * Se guarda en el navegador y, si hay carpeta local, en su `ajustes.json`.
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
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    void (async () => {
      const { getDirHandle } = await import("@/lib/folder");
      const dir = await getDirHandle();
      setFolderName(dir?.name ?? null);
      await syncSettingsWithFolder();
      const current = getAiProvider();
      setProvider(current);
      setHasKey(Boolean(getAiKey(current)));
    })();
  }, [open]);

  function choose(next: AiProvider) {
    setProvider(next);
    setValue("");
    setHasKey(Boolean(getAiKey(next)));
  }

  async function save() {
    const k = value.trim();
    if (!k && !getAiKey(provider)) {
      toast.error(`Escribe tu clave de ${PROVIDER_LABEL[provider]}`);
      return;
    }
    setBusy(true);
    setAiProvider(provider);
    if (k) setAiKey(provider, k);
    const savedToFolder = await saveSettingsToFolder();
    setBusy(false);
    setValue("");
    setHasKey(Boolean(getAiKey(provider)));
    onOpenChange(false);
    toast.success(
      savedToFolder
        ? `Clave de ${PROVIDER_LABEL[provider]} guardada en tu carpeta (${folderName ?? "ajustes.json"})`
        : `Clave de ${PROVIDER_LABEL[provider]} guardada en este navegador`,
    );
  }

  async function remove() {
    setBusy(true);
    setAiKey(provider, null);
    await saveSettingsToFolder();
    setBusy(false);
    setHasKey(false);
    toast(`Clave de ${PROVIDER_LABEL[provider]} borrada`);
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
            Elige el proveedor y pega tu clave. Se usará para transcribir, resumir, extraer tareas y
            redactar correos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                provider === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {PROVIDER_LABEL[p]}
              {getAiKey(p) ? " · ✓" : ""}
            </button>
          ))}
        </div>

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
              ? `Clave de ${PROVIDER_LABEL[provider]} guardada · escribe otra para cambiarla`
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

        <DialogFooter className="gap-2 sm:justify-between">
          {hasKey ? (
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
              Borrar clave
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
