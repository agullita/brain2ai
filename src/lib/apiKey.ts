/** Clave de Gemini del usuario, guardada solo en su navegador. */

export const GEMINI_KEY_LS = "acta-local-gemini-key";

/** Evento que se dispara al abrir los ajustes de la clave desde cualquier pantalla. */
export const OPEN_SETTINGS_EVENT = "acta-abrir-ajustes";
/** Evento que se dispara al cambiar la clave. */
export const KEY_CHANGED_EVENT = "acta-gemini-key";

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
