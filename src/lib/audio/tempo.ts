/**
 * Tempo estimation from an energy-flux onset envelope and autocorrelation.
 * Works best on material with clear percussive onsets. It is an estimate:
 * half/double-tempo confusions are common, so alternatives are returned too.
 */

export interface TempoEstimate {
  bpm: number;
  confidence: number; // 0..1
  alternatives: number[];
}

export function onsetEnvelope(mono: Float32Array, sampleRate: number, hop = 512, frame = 1024): { env: Float32Array; rate: number } {
  const n = Math.max(0, Math.floor((mono.length - frame) / hop) + 1);
  const energy = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let e = 0;
    const s = f * hop;
    for (let i = 0; i < frame; i++) e += mono[s + i] * mono[s + i];
    energy[f] = Math.log1p(1000 * Math.sqrt(e / frame));
  }
  const env = new Float32Array(n);
  for (let f = 1; f < n; f++) env[f] = Math.max(0, energy[f] - energy[f - 1]);
  return { env, rate: sampleRate / hop };
}

export function estimateTempo(mono: Float32Array, sampleRate: number, minBpm = 60, maxBpm = 200): TempoEstimate | null {
  const { env, rate } = onsetEnvelope(mono, sampleRate);
  if (env.length < rate * 4) return null; // need ~4 seconds
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const x = env.map((v) => v - mean);
  const minLag = Math.floor((60 / maxBpm) * rate);
  const maxLag = Math.ceil((60 / minBpm) * rate);
  const scores: Array<{ lag: number; score: number }> = [];
  let energy0 = 0;
  for (let i = 0; i < x.length; i++) energy0 += x[i] * x[i];
  if (energy0 <= 0) return null;
  for (let lag = minLag; lag <= maxLag && lag < x.length; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    // Mild preference for 80–140 BPM (most common for songs) to reduce octave errors.
    const bpm = (60 * rate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.8, 2));
    scores.push({ lag, score: (s / energy0) * (0.7 + 0.3 * prior) });
  }
  if (!scores.length) return null;
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  // Parabolic refinement of the best lag.
  const at = (lag: number) => scores.find((s) => s.lag === lag)?.score ?? best.score;
  const y0 = at(best.lag - 1);
  const y2 = at(best.lag + 1);
  const denom = y0 - 2 * best.score + y2;
  const refined = denom !== 0 ? best.lag + (0.5 * (y0 - y2)) / denom : best.lag;
  const bpm = (60 * rate) / refined;
  const meanScore = scores.reduce((a, s) => a + s.score, 0) / scores.length;
  const confidence = Math.max(0, Math.min(1, (best.score - meanScore) / (Math.abs(best.score) + 1e-9)));
  const alternatives = [bpm / 2, bpm * 2].filter((b) => b >= 40 && b <= 240).map((b) => Math.round(b * 10) / 10);
  return { bpm: Math.round(bpm * 10) / 10, confidence, alternatives };
}
