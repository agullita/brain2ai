import { createServerFn } from "@tanstack/react-start";
import { parseTasksFromText, stripTaskBlock } from "@/lib/tasks-parse";

// Transcripción, actas y preguntas con la API propia del usuario
// (Gemini, OpenAI o Cloudflare Workers AI).

export type AiProvider = "gemini" | "openai" | "cloudflare";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

const GEMINI_MODEL = process.env["GEMINI_MODEL"] || "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_CHAT_MODEL = process.env["OPENAI_MODEL"] || "gpt-4o-mini";
const OPENAI_STT_MODEL = process.env["OPENAI_STT_MODEL"] || "whisper-1";

const CF_CHAT_MODEL = process.env["CF_CHAT_MODEL"] || "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const CF_STT_MODEL = process.env["CF_STT_MODEL"] || "@cf/openai/whisper-large-v3-turbo";

function normalizeProvider(p: string | undefined): AiProvider {
  if (p === "openai" || p === "cloudflare") return p;
  return "gemini";
}

function resolveKey(provider: AiProvider, apiKey?: string): string {
  const envFallback =
    provider === "openai"
      ? process.env["OPENAI_API_KEY"]
      : provider === "cloudflare"
        ? process.env["CLOUDFLARE_API_TOKEN"]
        : process.env["GEMINI_API_KEY"];
  const key = apiKey?.trim() || envFallback;
  if (!key) throw new Error(`Falta tu credencial de ${labelOf(provider)}. Pégala en Ajustes.`);
  return key;
}

function resolveAccountId(accountId?: string): string {
  const id = accountId?.trim() || process.env["CLOUDFLARE_ACCOUNT_ID"];
  if (!id) throw new Error("Falta el Account ID de Cloudflare. Pégalo en Ajustes.");
  return id;
}

function labelOf(provider: AiProvider): string {
  return provider === "openai" ? "OpenAI" : provider === "cloudflare" ? "Cloudflare" : "Gemini";
}

async function assertOk(res: Response, label: string, provider: AiProvider): Promise<void> {
  if (res.ok) return;
  const detail = await res.text().catch(() => "");

  if (provider === "gemini") {
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

  if (provider === "openai") {
    if (res.status === 401) throw new Error("La clave de OpenAI no es válida.");
    if (res.status === 403)
      throw new Error("La clave de OpenAI no tiene permiso para este modelo.");
    if (res.status === 429)
      throw new Error(
        "Has llegado al límite de tu cuenta de OpenAI (revisa la facturación o inténtalo más tarde).",
      );
    throw new Error(`${label} (${res.status}): ${detail.slice(0, 300)}`);
  }

  // Cloudflare Workers AI
  if (res.status === 401)
    throw new Error("La API token o el Account ID de Cloudflare no son válidos.");
  if (res.status === 403)
    throw new Error("Tu API token de Cloudflare no tiene permiso para Workers AI.");
  if (res.status === 429)
    throw new Error(
      "Has agotado el cupo gratuito diario de Cloudflare Workers AI o hay demasiada demanda. Inténtalo más tarde.",
    );
  throw new Error(`${label} (${res.status}): ${detail.slice(0, 300)}`);
}

function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

// ---------- Gemini ----------

async function geminiCall(
  parts: Part[],
  system: string | undefined,
  apiKey: string | undefined,
  label: string,
): Promise<string> {
  const key = resolveKey("gemini", apiKey);
  const res = await fetch(`${GEMINI_API}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  await assertOk(res, label, "gemini");
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

// ---------- OpenAI / Cloudflare (chat compatible OpenAI) ----------

async function oaChat(opts: {
  base: string;
  model: string;
  apiKey: string;
  prompt: string;
  system?: string | undefined;
  label: string;
}): Promise<string> {
  const res = await fetch(`${opts.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: 0.3,
    }),
  });
  await assertOk(res, opts.label, opts.base.includes("cloudflare") ? "cloudflare" : "openai");
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// ---------- OpenAI ----------

async function openaiTranscribe(
  audioBase64: string,
  mime: string,
  apiKey: string | undefined,
  label: string,
): Promise<string> {
  const key = resolveKey("openai", apiKey);
  const form = new FormData();
  form.append(
    "file",
    new Blob([base64ToBytes(audioBase64)], { type: mime || "audio/wav" }),
    "audio.wav",
  );
  form.append("model", OPENAI_STT_MODEL);
  form.append("language", "es");
  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  await assertOk(res, label, "openai");
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

// ---------- Cloudflare Workers AI ----------

async function cloudflareTranscribe(
  audioBase64: string,
  apiKey: string | undefined,
  accountId: string | undefined,
  label: string,
): Promise<string> {
  const key = resolveKey("cloudflare", apiKey);
  const id = resolveAccountId(accountId);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${CF_STT_MODEL}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        audio: audioBase64,
        task: "transcribe",
        language: "es",
        vad_filter: true,
      }),
    },
  );
  await assertOk(res, label, "cloudflare");
  const data = (await res.json()) as { result?: { text?: string } };
  return data.result?.text ?? "";
}

// ---------- Utilidades compartidas ----------

async function callText(opts: {
  provider: AiProvider;
  prompt: string;
  system?: string | undefined;
  apiKey?: string | undefined;
  accountId?: string | undefined;
  label: string;
}): Promise<string> {
  if (opts.provider === "openai") {
    return oaChat({
      base: OPENAI_BASE,
      model: OPENAI_CHAT_MODEL,
      apiKey: resolveKey("openai", opts.apiKey),
      prompt: opts.prompt,
      system: opts.system,
      label: opts.label,
    });
  }
  if (opts.provider === "cloudflare") {
    const id = resolveAccountId(opts.accountId);
    return oaChat({
      base: `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`,
      model: CF_CHAT_MODEL,
      apiKey: resolveKey("cloudflare", opts.apiKey),
      prompt: opts.prompt,
      system: opts.system,
      label: opts.label,
    });
  }
  return geminiCall([{ text: opts.prompt }], opts.system, opts.apiKey, opts.label);
}

const ACTA_SYSTEM =
  'Eres un secretario de actas. A partir de una transcripción (que puede tener errores de reconocimiento), redacta en español un acta clara en Markdown con estas secciones: **Resumen** (3-5 líneas), **Puntos clave** (viñetas), **Decisiones**, **Tareas** (con responsable si se menciona y plazo si se menciona) y **Dudas abiertas**. Si algo no aparece en la transcripción, escribe \'No consta\'. No inventes datos.\n\nAdemás del resumen, extrae las acciones concretas a realizar. Devuelve esta lista de tareas estrictamente como un array de objetos JSON al final de tu respuesta, con este formato exacto:\n```json\n[{"title": "Acción en infinitivo", "description": "Contexto breve"}]\n```\nSi no hay acciones concretas, devuelve un array vacío [].';

// ---------- Funciones de servidor ----------

export const transcribeChunk = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      provider?: string;
      audio: string;
      mime?: string;
      sample?: string;
      speakers?: boolean;
      apiKey?: string;
      accountId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const provider = normalizeProvider(data.provider);

    if (provider === "openai") {
      const text = await openaiTranscribe(
        data.audio,
        data.mime || "audio/wav",
        data.apiKey,
        "Transcripción fallida",
      );
      return { text: text.trim() };
    }

    if (provider === "cloudflare") {
      const text = await cloudflareTranscribe(
        data.audio,
        data.apiKey,
        data.accountId,
        "Transcripción fallida",
      );
      return { text: text.trim() };
    }

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

    const text = await geminiCall(parts, undefined, data.apiKey, "Transcripción fallida");
    const clean = text
      .trim()
      .replace(/^<[^>]*>$/g, "")
      .trim();
    return { text: clean };
  });

export const summarizeMeeting = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      provider?: string;
      transcript: string;
      notes: string;
      style: string;
      apiKey?: string;
      accountId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const provider = normalizeProvider(data.provider);
    const raw = await callText({
      provider,
      system: ACTA_SYSTEM,
      apiKey: data.apiKey,
      accountId: data.accountId,
      label: "Resumen fallido",
      prompt: `Tipo de reunión: ${data.style}\n\nNotas marcadas por el usuario:\n${data.notes || "(ninguna)"}\n\nTranscripción:\n${data.transcript.slice(0, 120000)}`,
    });
    return { summary: stripTaskBlock(raw), tasks: parseTasksFromText(raw) };
  });

export const askMeeting = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      provider?: string;
      transcript: string;
      question: string;
      apiKey?: string;
      accountId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const provider = normalizeProvider(data.provider);
    const answer = await callText({
      provider,
      system:
        "Respondes preguntas sobre la transcripción de una reunión. Responde en español, breve y concreto. Si la respuesta no está en la transcripción, dilo claramente.",
      apiKey: data.apiKey,
      accountId: data.accountId,
      label: "Consulta fallida",
      prompt: `Transcripción:\n${data.transcript.slice(0, 120000)}\n\nPregunta: ${data.question}`,
    });
    return { answer };
  });

/** Comprueba que las credenciales del proveedor funcionan. */
export const testConnection = createServerFn({ method: "POST" })
  .inputValidator((data: { provider?: string; apiKey?: string; accountId?: string }) => data)
  .handler(async ({ data }) => {
    const provider = normalizeProvider(data.provider);
    const text = await callText({
      provider,
      prompt: "Responde únicamente con la palabra: OK",
      apiKey: data.apiKey,
      accountId: data.accountId,
      label: "Prueba de conexión",
    });
    return { text: text.trim().slice(0, 60) };
  });

/** Chat genérico para redactar correos, extraer tareas o sintetizar notas. */
export const aiChat = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      provider?: string;
      prompt: string;
      system?: string;
      apiKey?: string;
      accountId?: string;
      label?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const provider = normalizeProvider(data.provider);
    const text = await callText({
      provider,
      prompt: data.prompt,
      ...(data.system ? { system: data.system } : {}),
      apiKey: data.apiKey,
      accountId: data.accountId,
      label: data.label || "Consulta fallida",
    });
    return { text };
  });
