/**
 * Monophonic pitch tracking with the YIN algorithm
 * (de Cheveigné & Kawahara, 2002): difference function, cumulative mean
 * normalisation, absolute threshold and parabolic interpolation.
 *
 * Designed for clean monophonic voice (humming/singing). It is not a
 * polyphonic transcriber and will not reliably track pitch in mixed audio.
 */

export interface PitchFrame {
  /** Frame centre time in seconds. */
  time: number;
  /** Detected fundamental in Hz, or null when unvoiced/silent. */
  freq: number | null;
  /** 0..1 periodicity (1 - normalised difference at the chosen lag). */
  clarity: number;
  /** RMS level of the frame (linear). */
  rms: number;
}

export interface PitchOptions {
  minFreq: number;
  maxFreq: number;
  /** YIN absolute threshold (0.05–0.5). Lower = stricter. */
  threshold: number;
  /** Frame length in samples at the analysis rate. */
  frameSize: number;
  /** Hop length in samples at the analysis rate. */
  hopSize: number;
}

export const DEFAULT_PITCH_OPTIONS: PitchOptions = {
  minFreq: 65, // ~C2
  maxFreq: 1100, // ~C#6
  threshold: 0.15,
  frameSize: 1024,
  hopSize: 160,
};

/** Mix to mono and decimate by an integer factor with a simple box low-pass. */
export function downsample(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const n = Math.floor(samples.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k++) s += samples[base + k];
    out[i] = s / factor;
  }
  return out;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Choose a decimation factor that brings the rate close to (but not below) ~16 kHz. */
export function decimationFactor(sampleRate: number): number {
  return Math.max(1, Math.floor(sampleRate / 16000));
}

/** Run YIN on a single frame. Returns [freq|null, clarity]. */
export function yinFrame(
  frame: Float32Array,
  sampleRate: number,
  opts: Pick<PitchOptions, "minFreq" | "maxFreq" | "threshold">,
  scratch?: Float32Array,
): [number | null, number] {
  const tauMin = Math.max(2, Math.floor(sampleRate / opts.maxFreq));
  const tauMax = Math.min(Math.floor(frame.length / 2), Math.ceil(sampleRate / opts.minFreq));
  if (tauMax <= tauMin + 2) return [null, 0];
  const W = frame.length - tauMax;
  const d = scratch && scratch.length >= tauMax + 1 ? scratch : new Float32Array(tauMax + 1);
  d[0] = 1;
  // Difference function.
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = frame[j] - frame[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // Absolute threshold: first dip below threshold, then walk to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < opts.threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // No dip under threshold: report the global minimum's clarity but call it unvoiced.
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    return [null, Math.max(0, 1 - d[best])];
  }
  // Parabolic interpolation around tau.
  let betterTau = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = d[tau - 1];
    const s1 = d[tau];
    const s2 = d[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }
  return [sampleRate / betterTau, Math.max(0, Math.min(1, 1 - d[tau]))];
}

export interface AnalyzeProgress {
  (fraction: number): void;
}

/** Lazily analyse frames; shared by the async (UI) and sync (tests) entry points. */
function* pitchFrames(mono: Float32Array, sampleRate: number, opts: PitchOptions): Generator<[PitchFrame, number]> {
  const factor = decimationFactor(sampleRate);
  const x = downsample(mono, factor);
  const rate = sampleRate / factor;
  const frame = new Float32Array(opts.frameSize);
  const scratch = new Float32Array(opts.frameSize);
  const total = Math.max(0, Math.floor((x.length - opts.frameSize) / opts.hopSize) + 1);
  for (let f = 0; f < total; f++) {
    const start = f * opts.hopSize;
    let energy = 0;
    for (let i = 0; i < opts.frameSize; i++) {
      const v = x[start + i];
      frame[i] = v;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / opts.frameSize);
    let freq: number | null = null;
    let clarity = 0;
    if (rms > 1e-4) [freq, clarity] = yinFrame(frame, rate, opts, scratch);
    yield [{ time: (start + opts.frameSize / 2) / rate, freq, clarity, rms }, (f + 1) / total];
  }
}

/**
 * Track pitch over a whole mono signal. Work is chunked and yields to the
 * event loop so the UI stays responsive; `signal` can abort the analysis.
 */
export async function trackPitch(
  mono: Float32Array,
  sampleRate: number,
  options: Partial<PitchOptions> = {},
  onProgress?: AnalyzeProgress,
  signal?: AbortSignal,
): Promise<PitchFrame[]> {
  const opts = { ...DEFAULT_PITCH_OPTIONS, ...options };
  const frames: PitchFrame[] = [];
  let count = 0;
  for (const [frame, fraction] of pitchFrames(mono, sampleRate, opts)) {
    frames.push(frame);
    if (++count % 200 === 0) {
      if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
      onProgress?.(fraction);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);
  return frames;
}

/** Synchronous variant for tests and small buffers. */
export function trackPitchSync(mono: Float32Array, sampleRate: number, options: Partial<PitchOptions> = {}): PitchFrame[] {
  const opts = { ...DEFAULT_PITCH_OPTIONS, ...options };
  return Array.from(pitchFrames(mono, sampleRate, opts), ([f]) => f);
}
