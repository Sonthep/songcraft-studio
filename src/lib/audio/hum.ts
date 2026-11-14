import type { MidiNote } from "@/lib/project/schema";
import { uid } from "@/lib/project/factory";
import { frequencyToMidi } from "@/lib/music/theory";
import { secondsToTicks } from "@/lib/music/timing";
import { quantizeNotes } from "@/lib/music/note-ops";
import type { PitchFrame } from "./pitch";

export interface SegmentOptions {
  /** Frames quieter than this (dBFS) are treated as silence. */
  noiseGateDb: number;
  /** Minimum YIN clarity (0..1) to accept a frame as voiced. */
  minClarity: number;
  /** Notes shorter than this are discarded. */
  minNoteMs: number;
  /** A sustained pitch change larger than this starts a new note. */
  splitSemitones: number;
  /** Median filter length in frames (odd). */
  smoothingFrames: number;
  /** Repair isolated octave jumps (common pitch-tracker error). */
  octaveCorrection: boolean;
  /** Unvoiced gaps shorter than this are bridged inside a note. */
  maxGapMs: number;
  /** Split on re-articulation (energy dip then rise) at a steady pitch. */
  splitOnOnsets: boolean;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = {
  noiseGateDb: -45,
  minClarity: 0.6,
  minNoteMs: 90,
  splitSemitones: 0.8,
  smoothingFrames: 5,
  octaveCorrection: true,
  maxGapMs: 40,
  splitOnOnsets: true,
};

export interface DetectedNote {
  startSec: number;
  endSec: number;
  /** Median fractional MIDI pitch. */
  midiFloat: number;
  pitch: number;
  /** 0..1 combined estimate from periodicity, pitch stability and duration. */
  confidence: number;
  /** Cents deviation of the median from the rounded pitch. */
  centsOff: number;
}

export interface SegmentResult {
  notes: DetectedNote[];
  /** Per-frame processed MIDI pitch (null when unvoiced) — for contour display. */
  contour: Array<{ time: number; midi: number | null }>;
  voicedRatio: number;
  warnings: string[];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function segmentNotes(frames: PitchFrame[], options: Partial<SegmentOptions> = {}): SegmentResult {
  const o = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
  const warnings: string[] = [];
  if (frames.length < 2) {
    return { notes: [], contour: [], voicedRatio: 0, warnings: ["Recording is too short to analyse."] };
  }
  const hop = frames[1].time - frames[0].time;
  const gate = dbToLinear(o.noiseGateDb);

  // 1. Voicing decision.
  let midi: Array<number | null> = frames.map((f) =>
    f.freq != null && f.rms >= gate && f.clarity >= o.minClarity ? frequencyToMidi(f.freq) : null,
  );

  // 2. Octave correction against a local median of voiced neighbours.
  if (o.octaveCorrection) {
    const W = 12;
    midi = midi.map((m, i) => {
      if (m == null) return m;
      const neigh: number[] = [];
      for (let k = Math.max(0, i - W); k <= Math.min(midi.length - 1, i + W); k++) {
        const v = midi[k];
        if (k !== i && v != null) neigh.push(v);
      }
      if (neigh.length < 4) return m;
      const med = median(neigh);
      const diff = m - med;
      if (Math.abs(diff - 12) < 1.5) return m - 12;
      if (Math.abs(diff + 12) < 1.5) return m + 12;
      return m;
    });
  }

  // 3. Median smoothing within voiced runs.
  const half = Math.max(0, Math.floor(o.smoothingFrames / 2));
  if (half > 0) {
    const src = midi;
    midi = src.map((m, i) => {
      if (m == null) return null;
      const win: number[] = [];
      for (let k = i - half; k <= i + half; k++) {
        const v = src[k];
        if (v != null) win.push(v);
      }
      return median(win);
    });
  }

  const voicedCount = midi.filter((m) => m != null).length;
  const voicedRatio = voicedCount / midi.length;
  if (voicedRatio < 0.05) {
    warnings.push(
      "Almost no pitched sound was detected. Try a louder, cleaner recording, lower the noise gate, or raise sensitivity.",
    );
  }

  // 4. Segment into notes.
  const maxGapFrames = Math.max(0, Math.round(o.maxGapMs / 1000 / hop));
  const notes: DetectedNote[] = [];
  let cur: number[] = []; // frame indices
  let gap = 0;

  const flush = () => {
    if (cur.length === 0) return;
    const values = cur.map((i) => midi[i]!).filter((v) => v != null);
    const startSec = Math.max(0, frames[cur[0]].time - hop / 2);
    const endSec = frames[cur[cur.length - 1]].time + hop / 2;
    if ((endSec - startSec) * 1000 >= o.minNoteMs && values.length) {
      const med = median(values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      const clarity = cur.reduce((a, i) => a + frames[i].clarity, 0) / cur.length;
      const stability = Math.max(0, 1 - sd / 1.0);
      const durationFactor = Math.min(1, (endSec - startSec) / 0.25);
      const pitch = Math.round(med);
      notes.push({
        startSec,
        endSec,
        midiFloat: med,
        pitch,
        confidence: Math.max(0, Math.min(1, clarity * (0.5 + 0.5 * stability) * (0.6 + 0.4 * durationFactor))),
        centsOff: Math.round((med - pitch) * 100),
      });
    }
    cur = [];
    gap = 0;
  };

  for (let i = 0; i < midi.length; i++) {
    const m = midi[i];
    if (m == null) {
      if (cur.length) {
        gap++;
        if (gap > maxGapFrames) flush();
      }
      continue;
    }
    if (cur.length) {
      const ref = median(cur.slice(-6).map((k) => midi[k]!));
      // Require the change to persist for 3 frames before splitting (ignores vibrato/scoops).
      const persistent =
        Math.abs(m - ref) >= o.splitSemitones &&
        [1, 2].every((d) => {
          const v = midi[i + d];
          return v != null && Math.abs(v - ref) >= o.splitSemitones;
        });
      const reattack =
        o.splitOnOnsets &&
        i >= 3 &&
        frames[i].rms > 1.8 * Math.min(frames[i - 1].rms, frames[i - 2].rms) &&
        frames[i - 1].rms < 0.6 * Math.max(...cur.slice(-6).map((k) => frames[k].rms)) &&
        cur.length * hop * 1000 >= o.minNoteMs;
      if (persistent || reattack) flush();
    }
    gap = 0;
    cur.push(i);
  }
  flush();

  if (voicedRatio >= 0.05 && notes.length === 0) {
    warnings.push("Pitch was detected but no notes were long enough. Lower the minimum note duration.");
  }

  return {
    notes,
    contour: frames.map((f, i) => ({ time: f.time, midi: midi[i] })),
    voicedRatio,
    warnings,
  };
}

export interface ToMidiOptions {
  bpm: number;
  /** Seconds of audio that map to tick 0. */
  offsetSec: number;
  /** Tick placed at offsetSec. */
  startTick: number;
  gridTicks: number;
  /** 0..1 */
  quantizeStrength: number;
  transpose: number;
  minConfidence: number;
}

export function detectedToMidiNotes(notes: DetectedNote[], o: ToMidiOptions): MidiNote[] {
  const raw: MidiNote[] = notes
    .filter((n) => n.confidence >= o.minConfidence && n.endSec > o.offsetSec)
    .map((n) => {
      const start = Math.max(0, o.startTick + Math.round(secondsToTicks(n.startSec - o.offsetSec, o.bpm)));
      const end = o.startTick + Math.round(secondsToTicks(n.endSec - o.offsetSec, o.bpm));
      return {
        id: uid("n"),
        pitch: Math.max(0, Math.min(127, n.pitch + o.transpose)),
        startTick: start,
        durationTicks: Math.max(1, end - start),
        velocity: Math.round(60 + 50 * n.confidence),
        syllableId: null,
      };
    });
  if (o.quantizeStrength <= 0) return raw;
  return quantizeNotes(raw, null, { grid: o.gridTicks, strength: o.quantizeStrength, quantizeEnds: true });
}
