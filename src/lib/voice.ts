// Muestra de voz del usuario ("Yo") guardada en el propio navegador.
// Se usa como referencia para que la IA marque quién habla.

import { encodeWav } from "./recorder";

const KEY = "acta-local-voz";
const TARGET_RATE = 16000;

export function getVoiceSample(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function clearVoiceSample(): void {
  localStorage.removeItem(KEY);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("No se pudo leer el audio"));
    r.readAsDataURL(blob);
  });
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

// Graba unos segundos del micrófono y guarda la muestra en este ordenador.
export async function recordVoiceSample(
  seconds = 8,
  onLevel?: (level: number) => void,
): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const parts: Float32Array[] = [];
  let samples = 0;

  await new Promise<void>((resolve) => {
    node.onaudioprocess = (e) => {
      const raw = e.inputBuffer.getChannelData(0);
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < raw.length; i += 32) peak = Math.max(peak, Math.abs(raw[i] ?? 0));
        onLevel(peak);
      }
      const ds = downsample(new Float32Array(raw), ctx.sampleRate, TARGET_RATE);
      parts.push(ds);
      samples += ds.length;
      if (samples >= TARGET_RATE * seconds) resolve();
    };
    source.connect(node);
    node.connect(ctx.destination);
  });

  node.disconnect();
  source.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  void ctx.close();

  const wav = encodeWav(parts, TARGET_RATE);
  localStorage.setItem(KEY, await blobToBase64(wav));
}
