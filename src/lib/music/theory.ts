/**
 * Music theory primitives: pitch classes, scales, chords, voicings.
 * All pitches are MIDI note numbers (C4 = 60). Pitch classes are 0..11 (C = 0).
 */

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export const SCALES = {
  major: { label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  pentatonicMajor: { label: "Major Pentatonic", intervals: [0, 2, 4, 7, 9] },
  pentatonicMinor: { label: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
} as const;

export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

export const CHORD_QUALITIES = {
  maj: { symbol: "", label: "Major", intervals: [0, 4, 7] },
  min: { symbol: "m", label: "Minor", intervals: [0, 3, 7] },
  dim: { symbol: "dim", label: "Diminished", intervals: [0, 3, 6] },
  aug: { symbol: "aug", label: "Augmented", intervals: [0, 4, 8] },
  sus2: { symbol: "sus2", label: "Suspended 2", intervals: [0, 2, 7] },
  sus4: { symbol: "sus4", label: "Suspended 4", intervals: [0, 5, 7] },
  "7": { symbol: "7", label: "Dominant 7", intervals: [0, 4, 7, 10] },
  maj7: { symbol: "maj7", label: "Major 7", intervals: [0, 4, 7, 11] },
  m7: { symbol: "m7", label: "Minor 7", intervals: [0, 3, 7, 10] },
  m7b5: { symbol: "m7b5", label: "Half-diminished", intervals: [0, 3, 6, 10] },
  dim7: { symbol: "dim7", label: "Diminished 7", intervals: [0, 3, 6, 9] },
  "6": { symbol: "6", label: "Major 6", intervals: [0, 4, 7, 9] },
  m6: { symbol: "m6", label: "Minor 6", intervals: [0, 3, 7, 9] },
  add9: { symbol: "add9", label: "Add 9", intervals: [0, 4, 7, 14] },
  madd9: { symbol: "m(add9)", label: "Minor add 9", intervals: [0, 3, 7, 14] },
  "9": { symbol: "9", label: "Dominant 9", intervals: [0, 4, 7, 10, 14] },
  maj9: { symbol: "maj9", label: "Major 9", intervals: [0, 4, 7, 11, 14] },
  m9: { symbol: "m9", label: "Minor 9", intervals: [0, 3, 7, 10, 14] },
} as const;

export type ChordQuality = keyof typeof CHORD_QUALITIES;
export const CHORD_QUALITY_NAMES = Object.keys(CHORD_QUALITIES) as ChordQuality[];

const FLAT_KEYS_MAJOR = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_KEYS_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function prefersFlats(key: number, scale: ScaleName): boolean {
  const minorish = scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor";
  return minorish ? FLAT_KEYS_MINOR.has(mod12(key)) : FLAT_KEYS_MAJOR.has(mod12(key));
}

export function pitchClassName(pc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiToName(midi: number, flats = false): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${pitchClassName(midi, flats)}${octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

const NOTE_LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parsePitchClass(name: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(name.trim());
  if (!m) return null;
  let pc = NOTE_LETTER[m[1].toUpperCase()];
  for (const acc of m[2]) pc += acc === "#" || acc === "♯" ? 1 : -1;
  return mod12(pc);
}

export function keyLabel(key: number, scale: ScaleName): string {
  return `${pitchClassName(key, prefersFlats(key, scale))} ${SCALES[scale].label}`;
}

export function scalePitchClasses(key: number, scale: ScaleName): number[] {
  return SCALES[scale].intervals.map((i) => mod12(key + i));
}

export function isInScale(midi: number, key: number, scale: ScaleName): boolean {
  return scalePitchClasses(key, scale).includes(mod12(midi));
}

/** All scale pitches between low and high inclusive. */
export function scalePitchesInRange(key: number, scale: ScaleName, low: number, high: number): number[] {
  const pcs = new Set(scalePitchClasses(key, scale));
  const out: number[] = [];
  for (let p = low; p <= high; p++) if (pcs.has(mod12(p))) out.push(p);
  return out;
}

export interface ChordSpec {
  root: number; // pitch class
  quality: ChordQuality;
  bass?: number | null; // slash bass pitch class
}

export function chordPitchClasses(chord: ChordSpec): number[] {
  const pcs = CHORD_QUALITIES[chord.quality].intervals.map((i) => mod12(chord.root + i));
  if (chord.bass != null && !pcs.includes(mod12(chord.bass))) pcs.push(mod12(chord.bass));
  return pcs;
}

export function chordSymbol(chord: ChordSpec, flats = false): string {
  const base = `${pitchClassName(chord.root, flats)}${CHORD_QUALITIES[chord.quality].symbol}`;
  if (chord.bass != null && mod12(chord.bass) !== mod12(chord.root)) {
    return `${base}/${pitchClassName(chord.bass, flats)}`;
  }
  return base;
}

const QUALITY_ALIASES: Array<[RegExp, ChordQuality]> = [
  [/^(maj9|M9|Δ9)$/, "maj9"],
  [/^(m9|min9|-9)$/, "m9"],
  [/^9$/, "9"],
  [/^(maj7|M7|Δ7|Δ)$/, "maj7"],
  [/^(m7b5|ø|ø7|min7b5)$/, "m7b5"],
  [/^(m7|min7|-7)$/, "m7"],
  [/^(dim7|°7|o7)$/, "dim7"],
  [/^7$/, "7"],
  [/^(m\(add9\)|madd9|minadd9)$/, "madd9"],
  [/^(add9|add2)$/, "add9"],
  [/^(m6|min6)$/, "m6"],
  [/^6$/, "6"],
  [/^(sus2)$/, "sus2"],
  [/^(sus4|sus)$/, "sus4"],
  [/^(dim|°|o)$/, "dim"],
  [/^(aug|\+)$/, "aug"],
  [/^(m|min|-)$/, "min"],
  [/^(maj|M)?$/, "maj"],
];

/** Parse a chord symbol such as "Am", "F#m7", "Bbmaj7", "C/E". Returns null if not understood. */
export function parseChordSymbol(input: string): ChordSpec | null {
  const s = input.trim();
  const m = /^([A-Ga-g][#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?$/.exec(s);
  if (!m) return null;
  const root = parsePitchClass(m[1]);
  if (root == null) return null;
  const qualityText = m[2].trim();
  let quality: ChordQuality | null = null;
  for (const [re, q] of QUALITY_ALIASES) {
    if (re.test(qualityText)) {
      quality = q;
      break;
    }
  }
  if (!quality) return null;
  const bass = m[3] ? parsePitchClass(m[3]) : null;
  return { root, quality, bass };
}

/** Parse a progression string like "Am – F – C – G" or "Am F C G" or "Am | F | C | G". */
export function parseProgression(input: string): { chords: ChordSpec[]; invalid: string[] } {
  const tokens = input
    .split(/[\s,|–—-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const chords: ChordSpec[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    const c = parseChordSymbol(t);
    if (c) chords.push(c);
    else invalid.push(t);
  }
  return { chords, invalid };
}

/**
 * Voice a chord as MIDI pitches.
 * `octave` is the octave of the root in close position (4 => root near C4).
 * `inversion` rotates the lowest tones up an octave.
 */
export function voiceChord(chord: ChordSpec, octave = 4, inversion = 0, spread = false): number[] {
  const intervals = [...CHORD_QUALITIES[chord.quality].intervals];
  const rootMidi = (octave + 1) * 12 + mod12(chord.root);
  let pitches: number[] = intervals.map((i) => rootMidi + i);
  const inv = Math.max(0, Math.min(inversion, pitches.length - 1));
  for (let i = 0; i < inv; i++) {
    const lowest = pitches.shift()!;
    pitches.push(lowest + 12);
  }
  if (spread && pitches.length >= 3) {
    // Open voicing: drop the second-lowest voice an octave.
    pitches[1] -= 12;
    pitches.sort((a, b) => a - b);
  }
  if (chord.bass != null) {
    const lowest = Math.min(...pitches);
    let bassMidi = (octave + 1) * 12 + mod12(chord.bass) - 12;
    while (bassMidi >= lowest) bassMidi -= 12;
    pitches = [bassMidi, ...pitches];
  }
  return pitches.sort((a, b) => a - b);
}

/** Diatonic chord built on the given scale degree (0-based) using stacked thirds. */
export function diatonicChord(key: number, scale: ScaleName, degree: number, sevenths = false): ChordSpec {
  // Use a 7-note parent scale for harmony even when the melodic scale is pentatonic.
  const parent: ScaleName =
    scale === "pentatonicMajor" ? "major" : scale === "pentatonicMinor" ? "minor" : scale;
  const iv = SCALES[parent].intervals;
  const n = iv.length;
  const at = (d: number) => iv[d % n] + 12 * Math.floor(d / n);
  const root = at(degree);
  const third = at(degree + 2) - root;
  const fifth = at(degree + 4) - root;
  const seventh = at(degree + 6) - root;
  let quality: ChordQuality = "maj";
  if (third === 4 && fifth === 7) quality = sevenths ? (seventh === 11 ? "maj7" : "7") : "maj";
  else if (third === 3 && fifth === 7) quality = sevenths ? "m7" : "min";
  else if (third === 3 && fifth === 6) quality = sevenths ? (seventh === 10 ? "m7b5" : "dim7") : "dim";
  else if (third === 4 && fifth === 8) quality = "aug";
  return { root: mod12(key + root), quality };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function romanNumeral(chord: ChordSpec, key: number, scale: ScaleName): string {
  const parent: ScaleName =
    scale === "pentatonicMajor" ? "major" : scale === "pentatonicMinor" ? "minor" : scale;
  const iv = SCALES[parent].intervals;
  const rel = mod12(chord.root - key);
  const degree = iv.indexOf(rel as never);
  const minorish = ["min", "m7", "m6", "m9", "madd9", "dim", "m7b5", "dim7"].includes(chord.quality);
  let numeral: string;
  if (degree >= 0) numeral = ROMAN[degree];
  else {
    // Chromatic chord: describe as flat of the next degree up.
    const up = iv.findIndex((x) => x === mod12(rel + 1));
    numeral = up >= 0 ? `b${ROMAN[up]}` : `?`;
  }
  if (minorish) numeral = numeral.toLowerCase();
  const suffix =
    chord.quality === "dim" ? "°" : chord.quality === "m7b5" ? "ø7" : chord.quality === "aug" ? "+" :
    ["7", "maj7", "m7", "dim7"].includes(chord.quality) ? (chord.quality === "maj7" ? "maj7" : "7") : "";
  return numeral + suffix;
}

export interface ProgressionPreset {
  id: string;
  name: string;
  description: string;
  mode: "major" | "minor";
  /** Steps as [semitones from tonic, quality]. */
  steps: Array<[number, ChordQuality]>;
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "vi-IV-I-V",
    name: "Am – F – C – G (vi–IV–I–V)",
    description: "Emotional pop / ballad loop. In C major: Am F C G.",
    mode: "major",
    steps: [[9, "min"], [5, "maj"], [0, "maj"], [7, "maj"]],
  },
  {
    id: "I-V-vi-IV",
    name: "C – G – Am – F (I–V–vi–IV)",
    description: "The common pop progression. In C major: C G Am F.",
    mode: "major",
    steps: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]],
  },
  {
    id: "iv-i-V-i",
    name: "Dm – Am – E – Am (iv–i–V–i)",
    description: "Minor with a harmonic-minor dominant. In A minor: Dm Am E Am.",
    mode: "minor",
    steps: [[5, "min"], [0, "min"], [7, "maj"], [0, "min"]],
  },
  {
    id: "rnb-ii-V-I",
    name: "Dm7 – G7 – Cmaj7 – Am7 (ii–V–I–vi)",
    description: "Jazzy R&B movement with seventh chords.",
    mode: "major",
    steps: [[2, "m7"], [7, "7"], [0, "maj7"], [9, "m7"]],
  },
  {
    id: "rnb-IVmaj7-iii-vi",
    name: "Fmaj7 – Em7 – Am7 – Am7 (IVmaj7–iii7–vi7)",
    description: "Smooth neo-soul / R&B descending loop.",
    mode: "major",
    steps: [[5, "maj7"], [4, "m7"], [9, "m7"], [9, "m7"]],
  },
  {
    id: "minor-i-VI-III-VII",
    name: "Am – F – C – G (i–VI–III–VII)",
    description: "Minor-key view of the same loop; dark melodic rap / trap.",
    mode: "minor",
    steps: [[0, "min"], [8, "maj"], [3, "maj"], [10, "maj"]],
  },
  {
    id: "minor-i-iv-VI-V",
    name: "Am – Dm – F – E (i–iv–VI–V)",
    description: "Sad ballad cadence with a major V.",
    mode: "minor",
    steps: [[0, "min"], [5, "min"], [8, "maj"], [7, "maj"]],
  },
];

/**
 * Transpose a preset into the given key. Major presets in a minor key are
 * mapped via the relative major so "Am – F – C – G" stays meaningful.
 */
export function presetChords(preset: ProgressionPreset, key: number, scale: ScaleName): ChordSpec[] {
  const minorKey = scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor";
  let tonic = key;
  if (preset.mode === "major" && minorKey) tonic = mod12(key + 3); // relative major
  if (preset.mode === "minor" && !minorKey) tonic = mod12(key + 9); // relative minor
  return preset.steps.map(([semi, quality]) => ({ root: mod12(tonic + semi), quality }));
}
