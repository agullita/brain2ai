// Captura de micrófono: guarda audio comprimido (webm/opus) para el disco
// y genera trozos WAV de 16 kHz para transcribir.

export type RecorderHandle = {
  stop: () => Promise<{ audio: Blob; audioType: string; durationMs: number }>;
  elapsed: () => number;
};

const TARGET_RATE = 16000;
const CHUNK_SECONDS = 40;

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

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length * 2, true);
  let off = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i] ?? 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startRecording(opts: {
  onChunk?: (wav: Blob) => void;
  onLevel?: (level: number) => void;
}): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/mp4";
  const mediaChunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) mediaChunks.push(e.data);
  };
  recorder.start();

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  const startedAt = Date.now();

  node.onaudioprocess = (e) => {
    const raw = e.inputBuffer.getChannelData(0);
    if (opts.onLevel) {
      let peak = 0;
      for (let i = 0; i < raw.length; i += 32) peak = Math.max(peak, Math.abs(raw[i] ?? 0));
      opts.onLevel(peak);
    }
    const ds = downsample(new Float32Array(raw), ctx.sampleRate, TARGET_RATE);
    pending.push(ds);
    pendingSamples += ds.length;
    if (pendingSamples >= TARGET_RATE * CHUNK_SECONDS) {
      const wav = encodeWav(pending, TARGET_RATE);
      pending = [];
      pendingSamples = 0;
      opts.onChunk?.(wav);
    }
  };
  source.connect(node);
  node.connect(ctx.destination);

  return {
    elapsed: () => Date.now() - startedAt,
    stop: () =>
      new Promise((resolve) => {
        if (pendingSamples > TARGET_RATE * 1.5) {
          opts.onChunk?.(encodeWav(pending, TARGET_RATE));
        }
        pending = [];
        pendingSamples = 0;
        node.disconnect();
        source.disconnect();
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          resolve({
            audio: new Blob(mediaChunks, { type: mimeType }),
            audioType: mimeType,
            durationMs: Date.now() - startedAt,
          });
        };
        recorder.stop();
      }),
  };
}

// Convierte un archivo de audio (mp3, m4a, wav, ogg…) en trozos WAV de
// 16 kHz listos para transcribir, igual que la grabación en directo.
export async function fileToWavChunks(
  file: File,
): Promise<{ chunks: Blob[]; durationMs: number }> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < buf.length; i++) {
        mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / buf.numberOfChannels;
      }
    }
    const ds = downsample(mono, buf.sampleRate, TARGET_RATE);
    const chunks: Blob[] = [];
    const step = TARGET_RATE * CHUNK_SECONDS;
    for (let i = 0; i < ds.length; i += step) {
      chunks.push(encodeWav([ds.subarray(i, i + step)], TARGET_RATE));
    }
    return { chunks, durationMs: Math.round(buf.duration * 1000) };
  } finally {
    void ctx.close();
  }
}
