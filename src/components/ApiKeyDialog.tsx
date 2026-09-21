import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
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
import { getGeminiKey, setGeminiKey } from "@/lib/apiKey";

/**
 * Diálogo para que cada usuario introduzca su propia clave de Gemini.
 * La clave se guarda únicamente en el navegador (localStorage) del usuario.
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

  useEffect(() => {
    if (open) {
      setHasKey(Boolean(getGeminiKey()));
      setValue("");
    }
  }, [open]);

  function save() {
    const k = value.trim();
    if (!k) {
      toast.error("Escribe tu clave de Gemini");
      return;
    }
    setBusy(true);
    setGeminiKey(k);
    setHasKey(true);
    setValue("");
    setBusy(false);
    onOpenChange(false);
    toast.success("Clave guardada en este ordenador");
  }

  function remove() {
    setGeminiKey(null);
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
            Hace falta para transcribir, resumir y redactar con IA. Se guarda solo en este ordenador
            (nunca en nuestros servidores). Consíguela gratis en{" "}
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
            if (e.key === "Enter") save();
          }}
          placeholder={
            hasKey
              ? "Clave guardada · escribe otra para cambiarla"
              : "Pega aquí tu clave de API de Gemini"
          }
        />
        <DialogFooter className="gap-2 sm:justify-between">
          {hasKey ? (
            <Button variant="ghost" onClick={remove}>
              Borrar clave
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
