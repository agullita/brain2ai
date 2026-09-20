import { createServerFn } from "@tanstack/react-start";
import { parseTasksFromText, stripTaskBlock } from "@/lib/tasks-parse";

// Todo (transcripción, acta y preguntas) con la API propia de Gemini del usuario.
const MODEL = "gemini-3.5-flash-lite";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function gemini(parts: Part[], label: string, system?: string) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Falta la clave de Gemini. Guárdala en los secretos del proyecto.");

  const res = await fetch(`${API}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /api key/i.test(detail))
      throw new Error("La clave de Gemini no es válida.");
    if (res.status === 403)
      throw new Error("La clave de Gemini no es válida o no tiene la API activada.");
    if (res.status === 429)
      throw new Error(
        "Has llegado al límite de tu cuenta de Gemini (revisa la facturación o inténtalo más tarde).",
      );
    throw new Error(`${label} (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export const transcribeChunk = createServerFn({ method: "POST" })
  .inputValidator((data: { audio: string; sample?: string; speakers?: boolean }) => data)
  .handler(async ({ data }) => {
    const parts: Part[] = [];
    let instruction =
      "Transcribe exactamente lo que se dice en este audio, en español. Devuelve solo el texto hablado, sin comentarios ni marcas de tiempo. Si no se oye nada con claridad, devuelve una cadena vacía.";

    if (data.sample) {
      parts.push({ text: "AUDIO 1 — muestra de referencia con la voz de «Yo»:" });
      parts.push({ inline_data: { mime_type: "audio/wav", data: data.sample } });
      parts.push({ text: "AUDIO 2 — fragmento de la reunión a transcribir:" });
      parts.push({ inline_data: { mime_type: "audio/wav", data: data.audio } });
      instruction =
        "Transcribe el AUDIO 2 en español, separando los turnos de palabra. Empieza cada turno con una etiqueta: usa «Yo:» cuando la voz coincida con la del AUDIO 1 (misma persona, timbre parecido y además suele oírse más cerca y más fuerte por estar junto al micrófono) y «Hablante 2:», «Hablante 3:»… para las demás voces, manteniendo el mismo número para la misma voz dentro del fragmento. No inventes nombres propios. Devuelve solo los turnos, sin comentarios ni marcas de tiempo. Si no se oye nada con claridad, devuelve una cadena vacía.";
    } else if (data.speakers) {
      parts.push({ inline_data: { mime_type: "audio/wav", data: data.audio } });
      instruction =
        "Transcribe este audio en español separando los turnos de palabra. Empieza cada turno con «Hablante 1:», «Hablante 2:»… manteniendo el mismo número para la misma voz. No inventes nombres propios. Devuelve solo los turnos, sin comentarios ni marcas de tiempo. Si no se oye nada con claridad, devuelve una cadena vacía.";
    } else {
      parts.push({ inline_data: { mime_type: "audio/wav", data: data.audio } });
    }
    parts.push({ text: instruction });

    const text = await gemini(parts, "Transcripción fallida");
    const clean = text.trim().replace(/^<[^>]*>$/g, "").trim();
    return { text: clean };
  });

export const summarizeMeeting = createServerFn({ method: "POST" })
  .inputValidator((data: { transcript: string; notes: string; style: string }) => data)
  .handler(async ({ data }) => {
    const raw = await gemini(
      [
        {
          text: `Tipo de reunión: ${data.style}\n\nNotas marcadas por el usuario:\n${data.notes || "(ninguna)"}\n\nTranscripción:\n${data.transcript.slice(0, 120000)}`,
        },
      ],
      "Resumen fallido",
      "Eres un secretario de actas. A partir de una transcripción (que puede tener errores de reconocimiento), redacta en español un acta clara en Markdown con estas secciones: **Resumen** (3-5 líneas), **Puntos clave** (viñetas), **Decisiones**, **Tareas** (con responsable si se menciona y plazo si se menciona) y **Dudas abiertas**. Si algo no aparece en la transcripción, escribe 'No consta'. No inventes datos.\n\nAdemás del resumen, extrae las acciones concretas a realizar. Devuelve esta lista de tareas estrictamente como un array de objetos JSON al final de tu respuesta, con este formato exacto:\n```json\n[{\"title\": \"Acción en infinitivo\", \"description\": \"Contexto breve\"}]\n```\nSi no hay acciones concretas, devuelve un array vacío [].",
    );
    return { summary: stripTaskBlock(raw), tasks: parseTasksFromText(raw) };
  });

export const askMeeting = createServerFn({ method: "POST" })
  .inputValidator((data: { transcript: string; question: string }) => data)
  .handler(async ({ data }) => {
    const answer = await gemini(
      [
        {
          text: `Transcripción:\n${data.transcript.slice(0, 120000)}\n\nPregunta: ${data.question}`,
        },
      ],
      "Consulta fallida",
      "Respondes preguntas sobre la transcripción de una reunión. Responde en español, breve y concreto. Si la respuesta no está en la transcripción, dilo claramente.",
    );
    return { answer };
  });
