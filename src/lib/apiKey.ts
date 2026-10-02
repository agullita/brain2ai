/**
 * Ajustes de IA del usuario: proveedor activo (Gemini, OpenAI o Cloudflare) y sus
 * credenciales. Se guardan en el navegador y, si hay carpeta local, en `ajustes.json`.
 */

export type AiProvider = "gemini" | "openai" | "cloudflare";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  cloudflare: "Cloudflare",
};

export const GEMINI_KEY_LS = "acta-local-gemini-key";
export const OPENAI_KEY_LS = "acta-local-openai-key";
export const CF_ACCOUNT_LS = "acta-local-cf-account";
export const CF_KEY_LS = "acta-local-cf-key";
export const PROVIDER_LS = "acta-local-ai-provider";

/** Evento que se dispara al abrir los ajustes de IA desde cualquier pantalla. */
export const OPEN_SETTINGS_EVENT = "acta-abrir-ajustes";
/** Evento que se dispara al cambiar el proveedor o alguna credencial. */
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

function clean(v: string | null): string | null {
  return v && v.trim() ? v.trim() : null;
}

function notify(): void {
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

// ---------- proveedor ----------

export function getAiProvider(): AiProvider {
  const p = lsGet(PROVIDER_LS);
  if (p === "openai" || p === "cloudflare") return p;
  return "gemini";
}

export function setAiProvider(provider: AiProvider): void {
  lsSet(PROVIDER_LS, provider);
  notify();
}

// ---------- credenciales ----------

export function getGeminiKey(): string | null {
  return clean(lsGet(GEMINI_KEY_LS));
}

export function getOpenaiKey(): string | null {
  return clean(lsGet(OPENAI_KEY_LS));
}

export function getCfAccountId(): string | null {
  return clean(lsGet(CF_ACCOUNT_LS));
}

export function getCfKey(): string | null {
  return clean(lsGet(CF_KEY_LS));
}

export function setGeminiKey(key: string | null): void {
  lsSet(GEMINI_KEY_LS, key);
  notify();
}

export function setOpenaiKey(key: string | null): void {
  lsSet(OPENAI_KEY_LS, key);
  notify();
}

export function setCfAccountId(value: string | null): void {
  lsSet(CF_ACCOUNT_LS, value);
  notify();
}

export function setCfKey(key: string | null): void {
  lsSet(CF_KEY_LS, key);
  notify();
}

/** Credencial principal del proveedor (clave de API o token). */
export function getAiKey(provider: AiProvider): string | null {
  if (provider === "openai") return getOpenaiKey();
  if (provider === "cloudflare") return getCfKey();
  return getGeminiKey();
}

export function setAiKey(provider: AiProvider, key: string | null): void {
  if (provider === "openai") setOpenaiKey(key);
  else if (provider === "cloudflare") setCfKey(key);
  else setGeminiKey(key);
}

/** Account ID, solo para Cloudflare. */
export function getAiAccountId(provider: AiProvider): string | null {
  return provider === "cloudflare" ? getCfAccountId() : null;
}

export function setAiAccountId(provider: AiProvider, value: string | null): void {
  if (provider === "cloudflare") setCfAccountId(value);
}

/** Clave/token del proveedor activo. */
export function getActiveKey(): string | null {
  return getAiKey(getAiProvider());
}

/** Account ID del proveedor activo (o null si no aplica). */
export function getActiveAccountId(): string | null {
  return getAiAccountId(getAiProvider());
}

/** Indica si el proveedor tiene lo necesario para funcionar. */
export function providerReady(provider: AiProvider): boolean {
  if (provider === "cloudflare") return Boolean(getCfKey() && getCfAccountId());
  return Boolean(getAiKey(provider));
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
  cfAccountId?: string;
  cfApiKey?: string;
};

/** Lee los ajustes guardados en la carpeta local (ajustes.json). */
export async function loadSettingsFromFolder(): Promise<SettingsFile | null> {
  const { getDirHandle, readJsonFromFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return null;
  return readJsonFromFolder<SettingsFile>(dir, SETTINGS_FILE);
}

/** Guarda los ajustes actuales (proveedor + credenciales) en la carpeta local. */
export async function saveSettingsToFolder(): Promise<boolean> {
  const { getDirHandle, writeJsonToFolder } = await import("@/lib/folder");
  const dir = await getDirHandle();
  if (!dir) return false;
  try {
    await writeJsonToFolder(dir, SETTINGS_FILE, {
      provider: getAiProvider(),
      geminiApiKey: getGeminiKey() ?? undefined,
      openaiApiKey: getOpenaiKey() ?? undefined,
      cfAccountId: getCfAccountId() ?? undefined,
      cfApiKey: getCfKey() ?? undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sincroniza navegador y carpeta: si la carpeta tiene credenciales, mandan ellas;
 * si no, se copian a la carpeta las del navegador.
 */
export async function syncSettingsWithFolder(): Promise<void> {
  const fromFile = await loadSettingsFromFolder();
  const hasFolderKeys = Boolean(
    fromFile?.geminiApiKey || fromFile?.openaiApiKey || fromFile?.cfApiKey,
  );
  if (hasFolderKeys && fromFile) {
    if (fromFile.geminiApiKey) lsSet(GEMINI_KEY_LS, fromFile.geminiApiKey);
    if (fromFile.openaiApiKey) lsSet(OPENAI_KEY_LS, fromFile.openaiApiKey);
    if (fromFile.cfAccountId) lsSet(CF_ACCOUNT_LS, fromFile.cfAccountId);
    if (fromFile.cfApiKey) lsSet(CF_KEY_LS, fromFile.cfApiKey);
    if (fromFile.provider) lsSet(PROVIDER_LS, fromFile.provider);
    notify();
  } else if (getGeminiKey() || getOpenaiKey() || getCfKey()) {
    await saveSettingsToFolder();
  }
}
