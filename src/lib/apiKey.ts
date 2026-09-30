/**
 * Ajustes de IA del usuario: proveedor activo (Gemini u OpenAI) y sus claves.
 * Se guardan en el navegador y, si hay carpeta local elegida, en `ajustes.json`.
 */

export type AiProvider = "gemini" | "openai";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

export const GEMINI_KEY_LS = "acta-local-gemini-key";
export const OPENAI_KEY_LS = "acta-local-openai-key";
export const PROVIDER_LS = "acta-local-ai-provider";

/** Evento que se dispara al abrir los ajustes de IA desde cualquier pantalla. */
export const OPEN_SETTINGS_EVENT = "acta-abrir-ajustes";
/** Evento que se dispara al cambiar el proveedor o alguna clave. */
export const KEY_CHANGED_EVENT = "acta-gemini-key";

/** Nombre del archivo de ajustes dentro de la carpeta local. */
export const SETTINGS_FILE = "ajustes.json";

function lsGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (value && value.trim()) localStorage.setItem(key, value.trim());
    else localStorage.removeItem(key);
  } catch {
    /* almacenamiento no disponible */
  }
}

function notify(): void {
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

// ---------- proveedor ----------

export function getAiProvider(): AiProvider {
  return lsGet(PROVIDER_LS) === "openai" ? "openai" : "gemini";
}

export function setAiProvider(provider: AiProvider): void {
  lsSet(PROVIDER_LS, provider);
  notify();
}

// ---------- claves ----------

export function getGeminiKey(): string | null {
  const k = lsGet(GEMINI_KEY_LS);
  return k && k.trim() ? k.trim() : null;
}

export function getOpenaiKey(): string | null {
  const k = lsGet(OPENAI_KEY_LS);
  return k && k.trim() ? k.trim() : null;
}

export function setGeminiKey(key: string | null): void {
  lsSet(GEMINI_KEY_LS, key);
  notify();
}

export function setOpenaiKey(key: string | null): void {
  lsSet(OPENAI_KEY_LS, key);
  notify();
}

export function getAiKey(provider: AiProvider): string | null {
  return provider === "openai" ? getOpenaiKey() : getGeminiKey();
}

export function setAiKey(provider: AiProvider, key: string | null): void {
  if (provider === "openai") setOpenaiKey(key);
  else setGeminiKey(key);
}

/** Clave del proveedor activo. */
export function getActiveKey(): string | null {
  return getAiKey(getAiProvider());
}

/** Abre el diálogo de ajustes de IA desde cualquier pantalla. */
export function openApiKeySettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

// ---------- persistencia en la carpeta local ----------

type SettingsFile = {
  provider?: AiProvider;
  geminiApiKey?: string;
  openaiApiKey?: string;
};

/** Lee los ajustes guardados en la carpeta local (ajustes.json). */
export async function loadSettingsFromFolder(): Promise<SettingsFile | null> {
  const { getDirHandle, readJsonFromFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return null;
  return readJsonFromFolder<SettingsFile>(dir, SETTINGS_FILE);
}

/** Guarda los ajustes actuales (proveedor + claves) en la carpeta local. */
export async function saveSettingsToFolder(): Promise<boolean> {
  const { getDirHandle, writeJsonToFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return false;
  try {
    await writeJsonToFolder(dir, SETTINGS_FILE, {
      provider: getAiProvider(),
      geminiApiKey: getGeminiKey() ?? undefined,
      openaiApiKey: getOpenaiKey() ?? undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sincroniza navegador y carpeta: si la carpeta tiene claves, mandan ellas;
 * si no, se copian a la carpeta las del navegador.
 */
export async function syncSettingsWithFolder(): Promise<void> {
  const fromFile = await loadSettingsFromFolder();
  const hasFolderKeys = Boolean(fromFile?.geminiApiKey || fromFile?.openaiApiKey);
  if (hasFolderKeys && fromFile) {
    if (fromFile.geminiApiKey) lsSet(GEMINI_KEY_LS, fromFile.geminiApiKey);
    if (fromFile.openaiApiKey) lsSet(OPENAI_KEY_LS, fromFile.openaiApiKey);
    if (fromFile.provider) lsSet(PROVIDER_LS, fromFile.provider);
    notify();
  } else if (getGeminiKey() || getOpenaiKey()) {
    await saveSettingsToFolder();
  }
}
