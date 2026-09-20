// Recordatorios locales: notificaciones del navegador para tareas con fecha
// de hoy o vencidas. Sin servidores: se comprueba al abrir la app y cada hora.

import { readLocalCards } from "@/lib/tasks";

const NOTIFIED_LS = "acta-local-notificadas";

type NotifiedMap = Record<string, string>; // cardId -> "YYYY-MM-DD" ya notificado

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function enableReminders(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    const p = await Notification.requestPermission();
    return p === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function remindersEnabled(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

/** Notifica cada tarea no hecha con fecha de hoy o vencida, una vez al día. */
export function checkReminders(): number {
  if (!remindersEnabled()) return 0;
  const today = todayISO();
  const due: { id: string; text: string; vencida: boolean }[] = [];
  for (const c of readLocalCards()) {
    if (!c.due || c.column === "hecho") continue;
    if (c.due <= today) due.push({ id: c.id, text: c.text, vencida: c.due < today });
  }
  if (!due.length) return 0;

  let notified: NotifiedMap = {};
  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_LS) ?? "{}") as NotifiedMap;
  } catch {
    notified = {};
  }

  let count = 0;
  for (const t of due) {
    if (notified[t.id] === today) continue;
    try {
      const n = new Notification(t.vencida ? "Tarea vencida" : "Tarea para hoy", {
        body: t.text,
        tag: `acta-${t.id}`,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      continue;
    }
    notified[t.id] = today;
    count++;
  }

  try {
    localStorage.setItem(NOTIFIED_LS, JSON.stringify(notified));
  } catch {
    /* ignore */
  }
  return count;
}

/** Comprueba ahora y cada hora. Devuelve función de limpieza. */
export function startReminderLoop(): () => void {
  checkReminders();
  const id = setInterval(checkReminders, 60 * 60 * 1000);
  const onVisible = () => {
    if (document.visibilityState === "visible") checkReminders();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
