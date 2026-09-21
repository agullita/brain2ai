import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CircleHelp,
  ClipboardPaste,
  Download,
  FileAudio,
  ListChecks,
  ListTodo,
  Mail,
  FolderOpen,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import logoUrl from "@/assets/logo.png";
import { GlobalSearch, openGlobalSearch } from "@/components/GlobalSearch";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { estimateUsage, formatBytes } from "@/lib/idb";
import { downloadBackup, restoreBackup } from "@/lib/backup";
import { folderSupported, getDirHandle, pickFolder, setDirHandle } from "@/lib/folder";
import {
  KEY_CHANGED_EVENT,
  OPEN_SETTINGS_EVENT,
  getGeminiKey,
  syncKeyWithFolder,
} from "@/lib/apiKey";

const COLLAPSED_KEY = "acta-local-menu-collapsed";

const NAV = [
  { to: "/", label: "Grabar Reunión", icon: FileAudio },
  { to: "/importar", label: "Importar transcripción", icon: ClipboardPaste },
  { to: "/foco", label: "Next 3 Actions", icon: ListChecks },
  { to: "/notas", label: "Notebook", icon: NotebookPen },
  { to: "/tareas", label: "Tareas", icon: ListTodo },
  { to: "/correos", label: "Correos HTML", icon: Mail },
  { to: "/ayuda", label: "Ayuda", icon: CircleHelp },
] as const;

function notifyFolderChanged() {
  window.dispatchEvent(new Event("acta-folder"));
}

export function AppMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [usage, setUsage] = useState({ usage: 0, quota: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncKey = () => setHasKey(Boolean(getGeminiKey()));
    syncKey();
    window.addEventListener(KEY_CHANGED_EVENT, syncKey);
    return () => window.removeEventListener(KEY_CHANGED_EVENT, syncKey);
  }, []);

  useEffect(() => {
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings);
  }, []);

  // La carpeta local es la fuente de la clave: al arrancar y al cambiarla.
  useEffect(() => {
    void syncKeyWithFolder();
    const onFolder = () => void syncKeyWithFolder();
    window.addEventListener("acta-folder", onFolder);
    return () => window.removeEventListener("acta-folder", onFolder);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) setCollapsed(stored === "1");
    else if (window.innerWidth < 700) setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    void (async () => {
      const h = await getDirHandle();
      if (h) setFolderName(h.name);
      setUsage(await estimateUsage());
    })();
  }, []);

  async function chooseFolder() {
    if (!folderSupported()) {
      toast.error("Tu navegador no permite elegir carpeta. Usa Chrome o Edge en el ordenador.");
      return;
    }
    try {
      const h = await pickFolder();
      if (!h) return;
      setFolderName(h.name);
      notifyFolderChanged();
      toast.success(`Todo se guardará también en “${h.name}”`);
    } catch {
      /* cancelado */
    }
  }

  async function saveBackup() {
    try {
      await downloadBackup();
      toast.success("Copia de seguridad descargada");
    } catch {
      toast.error("No se pudo crear la copia de seguridad");
    }
  }

  function onRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = window.confirm(
      "Esto reemplazará TODA la información actual (notas, tareas, actas y ajustes) por la de la copia. ¿Continuar?",
    );
    if (!ok) return;
    void restoreBackup(file)
      .then((r) => {
        toast.success(`Copia restaurada: ${r.meetings} actas y todos tus ajustes`);
        setTimeout(() => window.location.reload(), 800);
      })
      .catch(() => {
        toast.error("El archivo no parece una copia de seguridad válida");
      });
  }

  async function forgetFolder() {
    setFolderName(null);
    await setDirHandle(null);
    notifyFolderChanged();
    toast.success("Carpeta desvinculada. Todo se sigue guardando en la app.");
  }

  const pct = usage.quota > 0 ? Math.min(100, Math.round((usage.usage / usage.quota) * 100)) : 0;

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Cabecera */}
      <div className={`border-b border-border/70 ${collapsed ? "p-3" : "p-5 pb-4"}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <img src={logoUrl} alt="Brain2ai" width={36} height={36} className="size-9 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold leading-none tracking-tight">
                Brain2ai
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Grabadora local
              </p>
            </div>
          )}
        </div>
      </div>

      <GlobalSearch />

      {/* Buscador */}
      <div className={collapsed ? "px-2 pt-2" : "px-3 pt-3"}>
        <button
          onClick={openGlobalSearch}
          title="Buscar (Ctrl+K)"
          className={`flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            collapsed ? "justify-center py-2" : "px-3 py-2"
          }`}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Buscar…</span>
              <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navegación */}
      <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "p-2" : "p-3"}`}>
        {!collapsed && (
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Menú
          </p>
        )}
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              title={label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Acciones y almacenamiento */}
      <div className={`space-y-4 border-t border-border/70 ${collapsed ? "p-2" : "p-4"}`}>
        {collapsed ? (
          <button
            onClick={() => void chooseFolder()}
            title={folderName ? `Carpeta: ${folderName}` : "Elegir carpeta"}
            className="flex w-full items-center justify-center rounded-xl bg-foreground py-2.5 text-background transition-colors hover:bg-foreground/85"
          >
            <FolderOpen className="size-4" />
          </button>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={() => void chooseFolder()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background shadow-sm transition-all hover:bg-foreground/85 active:scale-[0.98]"
            >
              <FolderOpen className="size-4" />
              {folderName ? `Carpeta: ${folderName}` : "Elegir carpeta"}
            </button>
            {folderName && (
              <button
                onClick={() => void forgetFolder()}
                className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" /> Dejar de guardar en la carpeta
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => setSettingsOpen(true)}
          title={hasKey ? "Ajustes: clave de IA guardada" : "Ajustes: falta tu clave de IA"}
          className={`relative flex w-full items-center gap-2 rounded-lg border py-2 text-xs font-medium transition-colors ${
            hasKey
              ? "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              : "border-primary/60 text-primary hover:bg-primary/10"
          } ${collapsed ? "justify-center" : "justify-center px-3"}`}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && (hasKey ? "Ajustes (clave IA)" : "Ajustes · falta tu clave")}
          {!hasKey && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}
        </button>

        <input
          ref={restoreRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onRestoreFile}
        />
        <button
          onClick={() => void saveBackup()}
          title="Descargar copia de seguridad"
          className={`flex w-full items-center gap-2 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            collapsed ? "justify-center" : "justify-center px-3"
          }`}
        >
          <Download className="size-4 shrink-0" />
          {!collapsed && "Descargar copia de seguridad"}
        </button>
        <button
          onClick={() => restoreRef.current?.click()}
          title="Restaurar copia de seguridad"
          className={`flex w-full items-center gap-2 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            collapsed ? "justify-center" : "justify-center px-3"
          }`}
        >
          <Upload className="size-4 shrink-0" />
          {!collapsed && "Restaurar copia de seguridad"}
        </button>

        {!collapsed && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-tight text-muted-foreground">
              <span>Espacio</span>
              <span>{usage.quota > 0 ? `${pct}%` : formatBytes(usage.usage)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Menú compacto"}
          className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            collapsed ? "justify-center" : "px-3"
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" /> Menú compacto
            </>
          )}
        </button>
      </div>

      <ApiKeyDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
