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
import { getGeminiKey, saveKeyToFolder, setGeminiKey, syncKeyWithFolder } from "@/lib/apiKey";

/**
 * Diálogo para que cada usuario introduzca su propia clave de Gemini.
 * Se guarda en el navegador y, si hay carpeta local, en su `ajustes.json`.
 */
export function ApiKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      await syncKeyWithFolder();
      setHasKey(Boolean(getGeminiKey()));
    })();
  }, [open]);

  async function save() {
    const k = value.trim();
    if (!k) {
      toast.error("Escribe tu clave de Gemini");
      return;
    }
    setBusy(true);
    setGeminiKey(k);
    const savedToFolder = await saveKeyToFolder(k);
    setBusy(false);
    setHasKey(true);
    setValue("");
    onOpenChange(false);
    toast.success(
      savedToFolder
        ? `Clave guardada en tu carpeta (${folderName ?? "ajustes.json"})`
        : "Clave guardada en este navegador",
    );
  }

  async function remove() {
    setBusy(true);
    setGeminiKey(null);
    await saveKeyToFolder(null);
    setBusy(false);
    setHasKey(false);
    toast("Clave borrada");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Tu clave de Gemini
          </DialogTitle>
          <DialogDescription>
            Hace falta para transcribir, resumir y redactar con IA. Consíguela gratis en{" "}
            <span className="font-medium text-foreground">aistudio.google.com</span> → «Get API
            key».
          </DialogDescription>
        </DialogHeader>
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
              ? "Clave guardada · escribe otra para cambiarla"
              : "Pega aquí tu clave de API de Gemini"
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
