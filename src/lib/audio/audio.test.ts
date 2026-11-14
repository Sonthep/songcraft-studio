import { describe, expect, it } from "vitest";
import { trackPitchSync, yinFrame, downsample, mixToMono } from "./pitch";
import { segmentNotes, detectedToMidiNotes } from "./hum";
import { estimateTempo } from "./tempo";
import { computePeaks, encodeWav } from "./wav";
import { frequencyToMidi } from "@/lib/music/theory";

const SR = 44100;

/** Harmonic test tone; frequency 0 = silence. */
function tone(parts: Array<[number, number]>, amp = 0.5, sr = SR): Float32Array {
  const total = parts.reduce((a, [, d]) => a + d, 0);
  const out = new Float32Array(Math.floor(total * sr));
  let i = 0;
  let phase = 0;
  for (const [f, d] of parts) {
    const n = Math.floor(d * sr);
    for (let k = 0; k < n && i < out.length; k++, i++) {
      if (f > 0) {
        phase += (2 * Math.PI * f) / sr;
        out[i] = amp * (Math.sin(phase) + 0.3 * Math.sin(2 * phase));
      }
    }
  }
  return out;
}

describe("pitch detection (YIN)", () => {
  it("detects a steady 220 Hz tone within a few cents", () => {
    const frames = trackPitchSync(tone([[220, 1]]), SR);
    const voiced = frames.filter((f) => f.freq);
    expect(voiced.length).toBeGreaterThan(frames.length * 0.8);
    const median = voiced.map((f) => f.freq!).sort((a, b) => a - b)[Math.floor(voiced.length / 2)];
    expect(Math.abs(1200 * Math.log2(median / 220))).toBeLessThan(10);
  });

  it("returns unvoiced frames for silence and nothing for empty input", () => {
    expect(trackPitchSync(new Float32Array(SR), SR).every((f) => f.freq === null)).toBe(true);
    expect(trackPitchSync(new Float32Array(0), SR)).toEqual([]);
    expect(yinFrame(new Float32Array(16), 16000, { minFreq: 65, maxFreq: 1000, threshold: 0.15 })[0]).toBeNull();
  });

  it("does not produce notes from white noise", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const noise = Float32Array.from({ length: SR }, () => rnd() * 0.3);
    const res = segmentNotes(trackPitchSync(noise, SR));
    expect(res.notes.length).toBeLessThanOrEqual(1);
  });

  it("mixes and downsamples", () => {
    expect(Array.from(mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])]))).toEqual([0.5, 0.5]);
    expect(Array.from(downsample(Float32Array.from([1, 3, 5, 7]), 2))).toEqual([2, 6]);
  });
});

describe("hum segmentation and MIDI conversion", () => {
  it("splits a three-note melody with a rest into notes", () => {
    const sig = tone([
      [261.63, 0.5],
      [0, 0.15],
      [329.63, 0.5],
      [392, 0.5],
    ]);
    const res = segmentNotes(trackPitchSync(sig, SR));
    expect(res.notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
    for (const n of res.notes) expect(n.confidence).toBeGreaterThan(0.5);
    expect(res.notes[0].startSec).toBeLessThan(0.05);
  });

  it("corrects isolated octave jumps", () => {
    const sig = tone([
      [220, 0.4],
      [440, 0.03],
      [220, 0.4],
    ]);
    const fixed = segmentNotes(trackPitchSync(sig, SR), { octaveCorrection: true });
    expect(fixed.notes.length).toBeGreaterThan(0);
    expect(fixed.notes.every((n) => n.pitch === Math.round(frequencyToMidi(220)))).toBe(true);
  });

  it("warns when nothing pitched is found", () => {
    const res = segmentNotes(trackPitchSync(new Float32Array(SR / 2), SR));
    expect(res.notes).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(segmentNotes([]).warnings[0]).toMatch(/too short/);
  });

  it("converts seconds to ticks with tempo, offset, confidence filter and quantization", () => {
    const notes = [
      { startSec: 1.02, endSec: 1.5, midiFloat: 60, pitch: 60, confidence: 0.9, centsOff: 0 },
      { startSec: 1.5, endSec: 2.0, midiFloat: 62, pitch: 62, confidence: 0.2, centsOff: 0 },
    ];
    const out = detectedToMidiNotes(notes, { bpm: 120, offsetSec: 1, startTick: 1920, gridTicks: 120, quantizeStrength: 1, transpose: 12, minConfidence: 0.5 });
    expect(out).toHaveLength(1);
    expect(out[0].pitch).toBe(72);
    expect(out[0].startTick).toBe(1920);
    expect(out[0].durationTicks).toBe(480);
  });
});

describe("tempo, peaks and WAV", () => {
  it("estimates the tempo of a click track (allowing half/double)", () => {
    const sr = 22050;
    const bpm = 100;
    const out = new Float32Array(sr * 10);
    for (let t = 0; t < 10; t += 60 / bpm) {
      const s = Math.floor(t * sr);
      for (let k = 0; k < 400 && s + k < out.length; k++) out[s + k] = Math.exp(-k / 60) * (k % 2 ? 0.9 : -0.9);
    }
    const est = estimateTempo(out, sr)!;
    expect([bpm, bpm / 2, bpm * 2].some((b) => Math.abs(est.bpm - b) < 2)).toBe(true);
    expect(estimateTempo(new Float32Array(sr), sr)).toBeNull();
  });

  it("computes min/max peaks", () => {
    expect(computePeaks(Float32Array.from([0, 1, -1, 0.5]), 2)).toEqual([
      { min: 0, max: 1 },
      { min: -1, max: 0.5 },
    ]);
  });

  it("encodes a valid 16-bit PCM WAV", () => {
    const data = Float32Array.from([0, 1, -1]);
    const buf = encodeWav({ numberOfChannels: 1, sampleRate: 8000, length: 3, getChannelData: () => data });
    const v = new DataView(buf);
    const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(str(0)).toBe("RIFF");
    expect(str(8)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint32(40, true)).toBe(6);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
});
