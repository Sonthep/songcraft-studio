import { diatonicChord, mod12, type ChordQuality, type ChordSpec, type ScaleName } from "./theory";

/**
 * Rule-based progression suggestions: common functional patterns (by scale
 * degree) with style-dependent colouring (sevenths for R&B, sus/add9 for pop).
 * Deterministic for a given seed so results can be regenerated.
 */

const MAJOR_PATTERNS: number[][] = [
  [5, 3, 0, 4], // vi IV I V
  [0, 4, 5, 3], // I V vi IV
  [0, 5, 3, 4], // I vi IV V
  [3, 0, 4, 5], // IV I V vi
  [1, 4, 0, 5], // ii V I vi
  [3, 4, 2, 5], // IV V iii vi
  [0, 2, 3, 4], // I iii IV V
  [5, 1, 4, 0], // vi ii V I
];

const MINOR_PATTERNS: number[][] = [
  [0, 5, 2, 6], // i VI III VII
  [0, 3, 4, 0], // i iv v i
  [3, 0, 4, 0], // iv i v i
  [0, 6, 5, 6], // i VII VI VII
  [0, 5, 3, 4], // i VI iv v
  [5, 6, 0, 0], // VI VII i i
  [0, 2, 6, 3], // i III VII iv
];

export type ProgressionFlavor = "triads" | "sevenths" | "pop-color";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colour(chord: ChordSpec, flavor: ProgressionFlavor, rng: () => number): ChordSpec {
  if (flavor === "triads") return chord;
  if (flavor === "sevenths") {
    const map: Partial<Record<ChordQuality, ChordQuality>> = { maj: "maj7", min: "m7", dim: "m7b5" };
    return { ...chord, quality: map[chord.quality] ?? chord.quality };
  }
  // pop colour: occasional add9 / sus
  if (chord.quality === "maj" && rng() < 0.35) return { ...chord, quality: rng() < 0.5 ? "add9" : "sus2" };
  if (chord.quality === "min" && rng() < 0.25) return { ...chord, quality: "madd9" };
  return chord;
}

export interface SuggestedProgression {
  degrees: number[];
  chords: ChordSpec[];
  description: string;
}

export function suggestProgressions(key: number, scale: ScaleName, flavor: ProgressionFlavor, seed: number, count = 4): SuggestedProgression[] {
  const minorish = scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor";
  const patterns = minorish ? MINOR_PATTERNS : MAJOR_PATTERNS;
  const rng = mulberry(seed);
  const order = patterns.map((p, i) => ({ p, i, r: rng() })).sort((a, b) => a.r - b.r).slice(0, count);
  return order.map(({ p }) => {
    let chords = p.map((d) => colour(diatonicChord(key, minorish && scale !== "harmonicMinor" ? "minor" : scale, d), flavor, rng));
    // In minor, make the v chord a major V half the time (harmonic-minor dominant).
    if (minorish && rng() < 0.5) {
      chords = chords.map((c, i) => (p[i] === 4 ? { ...c, quality: flavor === "sevenths" ? "7" : "maj" } : c));
    }
    const roman = describeDegrees(p, minorish);
    return { degrees: p, chords, description: roman };
  });
}

const MAJ_ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MIN_ROMAN = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export function describeDegrees(degrees: number[], minor: boolean): string {
  const r = minor ? MIN_ROMAN : MAJ_ROMAN;
  return degrees.map((d) => r[mod12(d) % 7]).join(" – ");
}
