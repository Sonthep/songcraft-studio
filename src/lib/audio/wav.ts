/** Minimal PCM WAV encoding and audio buffer utilities (no dependencies). */

export interface PcmLike {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

/** Encode 16-bit PCM WAV. */
export function encodeWav(buffer: PcmLike): ArrayBuffer {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  writeStr("RIFF");
  view.setUint32(p, 36 + dataSize, true);
  p += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(p, 16, true);
  p += 4;
  view.setUint16(p, 1, true); // PCM
  p += 2;
  view.setUint16(p, channels, true);
  p += 2;
  view.setUint32(p, buffer.sampleRate, true);
  p += 4;
  view.setUint32(p, buffer.sampleRate * channels * bytesPerSample, true);
  p += 4;
  view.setUint16(p, channels * bytesPerSample, true);
  p += 2;
  view.setUint16(p, 16, true);
  p += 2;
  writeStr("data");
  view.setUint32(p, dataSize, true);
  p += 4;
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return out;
}

export function wavBlob(buffer: PcmLike): Blob {
  return new Blob([encodeWav(buffer)], { type: "audio/wav" });
}

/** Copy a time range of an AudioBuffer into a new AudioBuffer. */
export function sliceAudioBuffer(ctx: BaseAudioContext, buf: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const s = Math.max(0, Math.floor(startSec * buf.sampleRate));
  const e = Math.min(buf.length, Math.ceil(endSec * buf.sampleRate));
  const len = Math.max(1, e - s);
  const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.copyToChannel(buf.getChannelData(c).subarray(s, s + len), c);
  }
  return out;
}

export interface Peak {
  min: number;
  max: number;
}

/** Min/max peaks per bucket for waveform drawing. */
export function computePeaks(data: Float32Array, buckets: number): Peak[] {
  const n = Math.max(1, Math.floor(buckets));
  const size = data.length / n;
  const peaks: Peak[] = new Array(n);
  for (let b = 0; b < n; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(data.length, Math.max(start + 1, Math.floor((b + 1) * size)));
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (start >= data.length) {
      min = 0;
      max = 0;
    }
    peaks[b] = { min, max };
  }
  return peaks;
}

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB upload limit
export const MAX_ANALYSIS_SECONDS = 180; // pitch analysis limit
export const ACCEPTED_AUDIO = "audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac,.aac";

export function validateAudioFile(file: File): string | null {
  if (file.size > MAX_AUDIO_BYTES) return `File is too large (${(file.size / 1048576).toFixed(1)} MB). Limit is 50 MB.`;
  const okType = file.type.startsWith("audio/") || file.type === "video/webm" || /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(file.name);
  if (!okType) return "Unsupported file type. Please choose an audio file (WAV, MP3, M4A, OGG, WEBM, FLAC).";
  return null;
}
