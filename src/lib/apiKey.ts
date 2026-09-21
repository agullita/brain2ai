/** Clave de Gemini del usuario. Se guarda en el navegador y, si hay carpeta
 *  local elegida, en un archivo `ajustes.json` de esa carpeta (el original). */

export const GEMINI_KEY_LS = "acta-local-gemini-key";

/** Evento que se dispara al abrir los ajustes de la clave desde cualquier pantalla. */
export const OPEN_SETTINGS_EVENT = "acta-abrir-ajustes";
/** Evento que se dispara al cambiar la clave. */
export const KEY_CHANGED_EVENT = "acta-gemini-key";

/** Nombre del archivo de ajustes dentro de la carpeta local. */
export const SETTINGS_FILE = "ajustes.json";

export function getGeminiKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const k = localStorage.getItem(GEMINI_KEY_LS);
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

export function setGeminiKey(key: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (key && key.trim()) localStorage.setItem(GEMINI_KEY_LS, key.trim());
    else localStorage.removeItem(GEMINI_KEY_LS);
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

/** Abre el diálogo de ajustes de la clave desde cualquier pantalla. */
export function openApiKeySettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

type SettingsFile = { geminiApiKey?: string };

/** Lee la clave guardada en la carpeta local (ajustes.json). */
export async function loadKeyFromFolder(): Promise<string | null> {
  const { getDirHandle, readJsonFromFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return null;
  const data = await readJsonFromFolder<SettingsFile>(dir, SETTINGS_FILE);
  const k = data?.geminiApiKey?.trim();
  return k || null;
}

/** Guarda (o borra) la clave en la carpeta local. Devuelve false si no hay carpeta. */
export async function saveKeyToFolder(key: string | null): Promise<boolean> {
  const { getDirHandle, writeJsonToFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return false;
  try {
    await writeJsonToFolder(dir, SETTINGS_FILE, {
      geminiApiKey: key?.trim() || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Si hay carpeta local, sincroniza la clave: la carpeta manda si tiene una;
 * si no, copia a la carpeta la que hubiera en el navegador.
 */
export async function syncKeyWithFolder(): Promise<void> {
  const { getDirHandle } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return;
  const fromFolder = await loadKeyFromFolder();
  const local = getGeminiKey();
  if (fromFolder) {
    if (fromFolder !== local) setGeminiKey(fromFolder);
  } else if (local) {
    await saveKeyToFolder(local);
  }
}
