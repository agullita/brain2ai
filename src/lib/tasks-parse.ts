// Extracción del bloque JSON de tareas que devuelve la IA (sirve en servidor y navegador).

export type ExtractedTask = { title: string; description?: string };

export function parseTasksFromText(text: string): ExtractedTask[] {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fenced) {
    for (const f of fenced) candidates.push(f.replace(/```(?:json)?/gi, "").replace(/```/g, ""));
  }
  const bare = text.match(/\[\s*{[\s\S]*}\s*\]/);
  if (bare) candidates.push(bare[0]);

  for (const c of candidates.reverse()) {
    try {
      const parsed = JSON.parse(c.trim());
      if (Array.isArray(parsed)) {
        const items = parsed
          .filter((p) => p && typeof p === "object")
          .map((p) => ({
            title: String((p as Record<string, unknown>)["title"] ?? "").trim(),
            description: String((p as Record<string, unknown>)["description"] ?? "").trim(),
          }))
          .filter((p) => p.title);
        if (items.length) return items;
      }
    } catch {
      /* siguiente candidato */
    }
  }
  return [];
}

/** Quita el bloque JSON del acta para que no se vea en el texto. */
export function stripTaskBlock(text: string): string {
  return text
    .replace(/```(?:json)?\s*\[\s*{[\s\S]*?}\s*\]\s*```/gi, "")
    .replace(/```(?:json)?\s*\[\s*\]\s*```/gi, "")
    .replace(/\n?\[\s*{\s*"title"[\s\S]*?}\s*\]\s*$/i, "")
    .trim();
}
