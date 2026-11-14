/**
 * Transparent rule-based vocal melody generator.
 *
 * Pipeline per phrase (one lyric line):
 *   syllables -> importance weights -> rhythm (onsets/durations on a grid)
 *   -> pitch selection (contour target + chord tones on strong beats + scale
 *      tones elsewhere + leap limits + soft Thai-tone direction preferences)
 *   -> MIDI notes linked to syllable ids.
 *
 * This is NOT a trained singing model. It produces editable sketches whose
 * every decision follows from the rules below; results should be reviewed and
 * edited in the Piano Roll.
 */
import type { ChordEvent, MidiNote, SectionType } from "@/lib/project/schema";
import type { SyllableToken } from "@/lib/lyrics/syllables";
import type { ThaiTone } from "@/lib/lyrics/thai";
import {
  chordPitchClasses,
  diatonicChord,
  midiToName,
  mod12,
  scalePitchesInRange,
  type ScaleName,
} from "@/lib/music/theory";
import { PPQ, metricStrength, ticksPerBar, ticksPerBeat, type TimeSignature } from "@/lib/music/timing";
import { uid } from "@/lib/project/factory";

export type ContourShape = "arch" | "descending" | "ascending" | "wave" | "flat" | "valley";
export type MelodyStyleId = "rnb" | "melodicRap" | "sadBallad" | "thaiPop" | "isan";

export interface MelodyStyle {
  id: MelodyStyleId;
  label: string;
  description: string;
  /** Smallest rhythmic unit in ticks. */
  unit: number;
  contours: ContourShape[];
  maxLeap: number;
  legato: number;
  pickupProbability: number;
  endHold: number;
  repeatPitchBias: number;
  /** Melodic scale override (e.g. pentatonic for Isan-inspired writing). */
  scaleOverride?: (scale: ScaleName) => ScaleName;
  defaults: Partial<MelodyControls>;
}

const pentatonicOf = (scale: ScaleName): ScaleName =>
  scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor"
    ? "pentatonicMinor"
    : "pentatonicMajor";

export const MELODY_STYLES: Record<MelodyStyleId, MelodyStyle> = {
  rnb: {
    id: "rnb",
    label: "Emotional R&B",
    description: "16th-note phrasing, anticipations before the beat, arched lines that resolve to chord tones.",
    unit: PPQ / 4,
    contours: ["arch", "wave", "descending"],
    maxLeap: 7,
    legato: 0.9,
    pickupProbability: 0.6,
    endHold: 2.2,
    repeatPitchBias: 0.2,
    defaults: { density: 0.6, syncopation: 0.55, range: 0.6, intensity: 0.5, repetition: 0.5 },
  },
  melodicRap: {
    id: "melodicRap",
    label: "Melodic Rap",
    description: "Dense 16ths, narrow pentatonic range, repeated pitches and short phrase-final holds.",
    unit: PPQ / 4,
    contours: ["flat", "wave", "descending"],
    maxLeap: 5,
    legato: 0.7,
    pickupProbability: 0.5,
    endHold: 1.4,
    repeatPitchBias: 0.7,
    scaleOverride: pentatonicOf,
    defaults: { density: 0.85, syncopation: 0.5, range: 0.3, intensity: 0.5, repetition: 0.7 },
  },
  sadBallad: {
    id: "sadBallad",
    label: "Sad Ballad",
    description: "Spacious 8th-note phrasing, wider range, long phrase endings, mostly stepwise motion.",
    unit: PPQ / 2,
    contours: ["arch", "descending", "valley"],
    maxLeap: 8,
    legato: 0.95,
    pickupProbability: 0.4,
    endHold: 3,
    repeatPitchBias: 0.15,
    defaults: { density: 0.35, syncopation: 0.2, range: 0.75, intensity: 0.55, repetition: 0.4 },
  },
  thaiPop: {
    id: "thaiPop",
    label: "Thai Pop",
    description: "8th/16th mix, clear downbeats, wave-like contours, moderate range.",
    unit: PPQ / 4,
    contours: ["wave", "arch", "ascending"],
    maxLeap: 7,
    legato: 0.85,
    pickupProbability: 0.35,
    endHold: 2,
    repeatPitchBias: 0.3,
    defaults: { density: 0.5, syncopation: 0.3, range: 0.55, intensity: 0.5, repetition: 0.55, toneAdherence: 0.6 },
  },
  isan: {
    id: "isan",
    label: "Isan-inspired",
    description:
      "Pentatonic melodic material, descending phrase shapes and repeated notes; stronger tone-direction weighting. Inspired by, not a model of, mor lam.",
    unit: PPQ / 4,
    contours: ["descending", "wave", "arch"],
    maxLeap: 5,
    legato: 0.8,
    pickupProbability: 0.45,
    endHold: 1.8,
    repeatPitchBias: 0.45,
    scaleOverride: pentatonicOf,
    defaults: { density: 0.6, syncopation: 0.35, range: 0.45, intensity: 0.5, repetition: 0.6, toneAdherence: 0.8 },
  },
};

export interface MelodyControls {
  /** 0..1 portion of the vocal range to use. */
  range: number;
  /** 0..1 rhythmic density (quarter notes -> 16ths per syllable). */
  density: number;
  /** 0..1 reuse of rhythm/pitch motifs between similar lines. */
  repetition: number;
  /** 0..1 tessitura height, contour depth, velocity. */
  intensity: number;
  /** 0..1 probability of anticipations/off-beat onsets. */
  syncopation: number;
  /** Bars per phrase (one lyric line). */
  phraseBars: 1 | 2 | 4;
  /** 0..1 weight of Thai lexical-tone direction preferences (soft constraint). */
  toneAdherence: number;
  /** 0..1 randomness/variety of pitch choices. */
  complexity: number;
}

export const DEFAULT_CONTROLS: MelodyControls = {
  range: 0.55,
  density: 0.55,
  repetition: 0.5,
  intensity: 0.5,
  syncopation: 0.35,
  phraseBars: 2,
  toneAdherence: 0.5,
  complexity: 0.4,
};

export interface PhraseInput {
  lineId: string;
  text: string;
  sectionType: SectionType;
  tokens: SyllableToken[];
}

/** Optional per-phrase guidance (e.g. from an AI provider); realized by these same rules. */
export interface PhrasePlan {
  contour?: ContourShape;
  peakSyllableIndex?: number;
  density?: number;
  syncopation?: number;
  emphasisIndices?: number[];
  rationale?: string;
}

export interface MelodyInput {
  phrases: PhraseInput[];
  key: number;
  scale: ScaleName;
  timeSignature: TimeSignature;
  chords: ChordEvent[];
  vocalRange: { low: number; high: number };
  startTick: number;
  style: MelodyStyleId;
  controls: MelodyControls;
  seed: number;
  plans?: Record<string, PhrasePlan>;
}

export type ToneFit = "good" | "neutral" | "conflict";

export interface GeneratedNote extends MidiNote {
  lineId: string;
  chordTone: boolean;
  strong: boolean;
  toneFit: ToneFit | null;
  thaiTone: ThaiTone | null;
}

export interface PhraseLayout {
  lineId: string;
  startTick: number;
  bars: number;
}

export interface CandidateMetrics {
  noteCount: number;
  lowest: string;
  highest: string;
  rangeSemitones: number;
  chordToneRatioStrong: number;
  chordFitWeighted: number;
  stepwiseRatio: number;
  toneGood: number;
  toneConflict: number;
  toneTotal: number;
  syncopatedRatio: number;
}

export interface MelodyCandidate {
  id: string;
  name: string;
  seed: number;
  contour: ContourShape;
  notes: GeneratedNote[];
  layout: PhraseLayout[];
  metrics: CandidateMetrics;
  explanation: string[];
  chordSource: "project" | "project-looped" | "default";
}

/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function contourValue(shape: ContourShape, p: number): number {
  switch (shape) {
    case "arch":
      return Math.sin(Math.PI * Math.min(1, p * 1.1));
    case "descending":
      return 1 - p * 0.9;
    case "ascending":
      return 0.15 + p * 0.85;
    case "wave":
      return 0.5 + 0.45 * Math.sin(2 * Math.PI * (p * 1.25 + 0.1));
    case "valley":
      return 1 - Math.sin(Math.PI * p) * 0.8;
    case "flat":
      return 0.45 + 0.1 * Math.sin(2 * Math.PI * p * 2);
  }
}

export const CONTOUR_LABELS: Record<ContourShape, string> = {
  arch: "Arch (rise then fall)",
  descending: "Descending",
  ascending: "Ascending",
  wave: "Wave",
  valley: "Valley (dip then rise)",
  flat: "Flat / chant-like",
};

/** Resolve the chord sounding at `tick`, looping project chords or falling back to a default loop. */
export function makeChordLookup(
  chords: ChordEvent[],
  key: number,
  scale: ScaleName,
  ts: TimeSignature,
): { at: (tick: number) => number[]; source: MelodyCandidate["chordSource"]; loopTicks: number } {
  if (chords.length) {
    const sorted = [...chords].sort((a, b) => a.startTick - b.startTick);
    const end = Math.max(...sorted.map((c) => c.startTick + c.durationTicks));
    const bar = ticksPerBar(ts);
    const loopTicks = Math.ceil(end / bar) * bar;
    const at = (tick: number) => {
      const t = tick < end ? tick : loopTicks > 0 ? tick % loopTicks : tick;
      let found: ChordEvent | undefined;
      for (const c of sorted) if (c.startTick <= t && t < c.startTick + c.durationTicks) found = c;
      if (!found) found = [...sorted].reverse().find((c) => c.startTick <= t) ?? sorted[0];
      return chordPitchClasses({ root: found.root, quality: found.quality, bass: found.bass });
    };
    return { at, source: "project-looped", loopTicks };
  }
  const minorish = scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor";
  const degrees = minorish ? [0, 5, 2, 6] : [0, 4, 5, 3]; // i–VI–III–VII  or  I–V–vi–IV
  const loop = degrees.map((d) => chordPitchClasses(diatonicChord(key, scale, d)));
  const bar = ticksPerBar(ts);
  return { at: (tick: number) => loop[Math.floor(tick / bar) % loop.length], source: "default", loopTicks: bar * 4 };
}

/** Phrase placement: depends only on syllable counts and settings (not on the seed). */
export function layoutPhrases(input: MelodyInput): PhraseLayout[] {
  const style = MELODY_STYLES[input.style];
  const bar = ticksPerBar(input.timeSignature);
  const out: PhraseLayout[] = [];
  let tick = input.startTick;
  for (const ph of input.phrases) {
    const n = Math.max(1, ph.tokens.length);
    // Minimum space: every syllable gets at least one unit, plus one beat to breathe.
    const needed = n * style.unit + ticksPerBeat(input.timeSignature);
    const bars = Math.max(input.controls.phraseBars, Math.ceil(needed / bar));
    out.push({ lineId: ph.lineId, startTick: tick, bars });
    tick += bars * bar;
  }
  return out;
}

interface PhraseResult {
  notes: GeneratedNote[];
  rhythm: number[]; // onset offsets relative to phrase start
  durations: number[];
}

function isImportant(t: SyllableToken, index: number, n: number, plan?: PhrasePlan): boolean {
  if (plan?.emphasisIndices?.includes(index)) return true;
  if (index === n - 1) return true;
  return t.content && t.stressed && t.wordEnd;
}

function generateRhythm(
  ph: PhraseInput,
  layout: PhraseLayout,
  input: MelodyInput,
  rng: () => number,
  plan?: PhrasePlan,
): { onsets: number[]; durations: number[] } {
  const style = MELODY_STYLES[input.style];
  const ts = input.timeSignature;
  const beat = ticksPerBeat(ts);
  const unit = style.unit;
  const n = ph.tokens.length;
  if (n === 0) return { onsets: [], durations: [] };
  const window = layout.bars * ticksPerBar(ts);
  const density = plan?.density ?? input.controls.density;
  const sync = plan?.syncopation ?? input.controls.syncopation;

  // Start offset: downbeat, an 8th late, or a beat late (leaving a pickup-like space).
  let offset = 0;
  const r = rng();
  if (r < style.pickupProbability * 0.5) offset = Math.min(beat / 2, unit * 2);
  else if (r < style.pickupProbability) offset = beat;
  const breath = beat;
  let available = window - offset - breath;
  if (available < n * unit) {
    offset = 0;
    available = window - breath;
  }
  available = Math.max(n * unit, available);

  const targetIOI = Math.max(unit, Math.round(lerp(PPQ, PPQ / 4, density) / unit) * unit);
  const weights = ph.tokens.map((t, i) => {
    let w = 1;
    if (t.stressed) w += 0.35;
    if (isImportant(t, i, n, plan)) w += 0.45;
    if (t.wordEnd && i < n - 1) w += 0.15;
    if (i === n - 1) w += style.endHold;
    w += rng() * 0.35 * (1 - input.controls.repetition * 0.5);
    return w;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const desiredSpan = Math.min(available, Math.round((targetIOI * weightSum) / (1 + 0.35 * 0.5)));
  const span = Math.max(n * unit, desiredSpan);

  // Cumulative onset positions quantized to the unit grid, strictly increasing.
  const onsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let pos = Math.round(((acc / weightSum) * span) / unit) * unit;
    const prev = onsets[i - 1];
    if (prev !== undefined && pos <= prev) pos = prev + unit;
    // Leave enough room for the remaining syllables.
    pos = Math.min(pos, span - (n - i) * unit);
    if (prev !== undefined && pos <= prev) pos = prev + unit;
    onsets.push(pos);
    acc += weights[i];
  }

  // Syncopation: anticipate on-beat onsets by one unit (R&B/pop "push").
  for (let i = 1; i < n; i++) {
    const abs = layout.startTick + offset + onsets[i];
    if (metricStrength(abs, ts) >= 2 && rng() < sync * 0.55) {
      const shifted = onsets[i] - unit;
      if (shifted > onsets[i - 1]) onsets[i] = shifted;
    }
  }

  const durations = onsets.map((o, i) => {
    const next = i < n - 1 ? onsets[i + 1] : Math.min(span, available);
    const ioi = Math.max(unit, next - o);
    const legato = i === n - 1 ? 0.95 : style.legato;
    return Math.max(Math.round(unit / 2), Math.round(ioi * legato));
  });

  return { onsets: onsets.map((o) => o + offset), durations };
}

function toneDirectionCost(tone: ThaiTone | null, dir: number | null, weight: number): number {
  if (!tone || dir === null || weight <= 0) return 0;
  switch (tone) {
    case "rising":
    case "high":
      return dir < 0 ? weight * (1 + Math.min(3, -dir) * 0.2) : dir === 0 ? weight * 0.2 : 0;
    case "low":
      return dir > 0 ? weight * (1 + Math.min(3, dir) * 0.2) : 0;
    case "falling":
      return dir < -2 ? weight * 0.6 : 0;
    case "mid":
      return Math.abs(dir) > 3 ? weight * 0.5 : 0;
  }
}

function evaluateToneFit(tone: ThaiTone | null, dir: number | null): ToneFit | null {
  if (!tone || dir === null) return null;
  if (toneDirectionCost(tone, dir, 1) === 0) {
    if ((tone === "rising" || tone === "high") && dir > 0) return "good";
    if (tone === "low" && dir < 0) return "good";
    if (tone === "falling" && dir >= 0) return "good";
    if (tone === "mid" && Math.abs(dir) <= 2) return "good";
    return "neutral";
  }
  return "conflict";
}

function generatePhrase(
  phIndex: number,
  input: MelodyInput,
  layout: PhraseLayout,
  contour: ContourShape,
  rng: () => number,
  prevPitch: number | null,
  chordAt: (tick: number) => number[],
  rhythmOverride?: { onsets: number[]; durations: number[] },
): PhraseResult {
  const style = MELODY_STYLES[input.style];
  const ph = input.phrases[phIndex];
  const plan = input.plans?.[ph.lineId];
  const shape = plan?.contour ?? contour;
  const scale = style.scaleOverride ? style.scaleOverride(input.scale) : input.scale;
  const n = ph.tokens.length;
  const { onsets, durations } = rhythmOverride ?? generateRhythm(ph, layout, input, rng, plan);

  const low = Math.min(input.vocalRange.low, input.vocalRange.high);
  const high = Math.max(input.vocalRange.low, input.vocalRange.high);
  const full = Math.max(5, high - low);
  const sectionLift = ph.sectionType === "chorus" || ph.sectionType === "hook" ? 0.12 : ph.sectionType === "bridge" ? 0.06 : 0;
  const intensity = input.controls.intensity;
  const center = low + full * Math.min(0.85, 0.32 + 0.3 * intensity + sectionLift);
  const span = lerp(7, full, input.controls.range);
  const lowE = Math.max(low, Math.round(center - span / 2));
  const highE = Math.min(high, Math.round(center + span / 2));
  let pool = scalePitchesInRange(input.key, scale, lowE, highE);
  if (pool.length < 3) pool = scalePitchesInRange(input.key, scale, low, high);
  if (pool.length === 0) pool = [Math.round(center)];

  const notes: GeneratedNote[] = [];
  let prev = prevPitch;
  const peakIdx = plan?.peakSyllableIndex;
  for (let i = 0; i < n; i++) {
    const tok = ph.tokens[i];
    const tick = layout.startTick + onsets[i];
    const p = n === 1 ? 0.5 : i / (n - 1);
    let cv = contourValue(shape, p);
    if (peakIdx !== undefined && n > 1) cv = Math.max(cv, 1 - Math.abs(i - peakIdx) / Math.max(2, n / 3));
    const depth = 0.55 + 0.45 * intensity;
    const target = center + (cv - 0.5) * (highE - lowE) * depth;
    const chordPcs = chordAt(tick);
    const strong = metricStrength(tick, input.timeSignature) >= 2 || durations[i] >= PPQ || isImportant(tok, i, n, plan);
    const last = i === n - 1;
    const inChord = pool.filter((c) => chordPcs.includes(mod12(c)));
    const candidates = (strong || last) && inChord.length ? inChord : pool;
    const thaiTone = tok.thai && tok.confidence >= 0.5 ? tok.thai.tone : null;
    const toneW = input.controls.toneAdherence * 2.2;

    let best = candidates[0];
    let bestCost = Infinity;
    for (const c of candidates) {
      let cost = Math.abs(c - target) * 0.35;
      if (prev !== null) {
        const d = Math.abs(c - prev);
        if (d === 0) cost += 0.35 - style.repeatPitchBias * input.controls.repetition * 0.9;
        else if (d <= 2) cost += 0;
        else if (d <= 4) cost += 0.6;
        else if (d <= 7) cost += 1.5;
        else cost += 4;
        if (d > style.maxLeap) cost += 10;
        cost += toneDirectionCost(thaiTone, c - prev, toneW);
      }
      if (last) {
        // Cadence: prefer the chord root or third, and the tonic at section ends.
        const rel = mod12(c - chordPcs[0]);
        if (rel === 0) cost -= 0.5;
        else if (rel === 3 || rel === 4) cost -= 0.3;
        if (mod12(c - input.key) === 0) cost -= 0.25;
      }
      cost += rng() * (0.25 + 1.2 * input.controls.complexity);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    const dir = prev === null ? null : best - prev;
    const velocity = Math.max(
      30,
      Math.min(127, Math.round(62 + 38 * intensity + (strong ? 10 : -6) + (tok.stressed ? 4 : 0) + (rng() - 0.5) * 6)),
    );
    notes.push({
      id: `gen_${input.seed}_${ph.lineId}_${i}`,
      pitch: best,
      startTick: tick,
      durationTicks: durations[i],
      velocity,
      syllableId: tok.id,
      lineId: ph.lineId,
      chordTone: chordPcs.includes(mod12(best)),
      strong,
      toneFit: evaluateToneFit(thaiTone, dir),
      thaiTone,
    });
    prev = best;
  }
  return { notes, rhythm: onsets, durations };
}

export function computeMetrics(notes: GeneratedNote[], ts: TimeSignature): CandidateMetrics {
  if (!notes.length) {
    return {
      noteCount: 0, lowest: "-", highest: "-", rangeSemitones: 0, chordToneRatioStrong: 0, chordFitWeighted: 0,
      stepwiseRatio: 0, toneGood: 0, toneConflict: 0, toneTotal: 0, syncopatedRatio: 0,
    };
  }
  const pitches = notes.map((n) => n.pitch);
  const lo = Math.min(...pitches);
  const hi = Math.max(...pitches);
  const strong = notes.filter((n) => n.strong);
  const totalDur = notes.reduce((a, n) => a + n.durationTicks, 0);
  const chordDur = notes.filter((n) => n.chordTone).reduce((a, n) => a + n.durationTicks, 0);
  let steps = 0;
  let intervals = 0;
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].lineId !== notes[i - 1].lineId) continue;
    intervals++;
    if (Math.abs(notes[i].pitch - notes[i - 1].pitch) <= 2) steps++;
  }
  const toned = notes.filter((n) => n.toneFit);
  return {
    noteCount: notes.length,
    lowest: midiToName(lo),
    highest: midiToName(hi),
    rangeSemitones: hi - lo,
    chordToneRatioStrong: strong.length ? strong.filter((n) => n.chordTone).length / strong.length : 0,
    chordFitWeighted: totalDur ? chordDur / totalDur : 0,
    stepwiseRatio: intervals ? steps / intervals : 0,
    toneGood: toned.filter((n) => n.toneFit === "good").length,
    toneConflict: toned.filter((n) => n.toneFit === "conflict").length,
    toneTotal: toned.length,
    syncopatedRatio: notes.filter((n) => metricStrength(n.startTick, ts) === 0).length / notes.length,
  };
}

function normalizeLine(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function generateMelody(input: MelodyInput, contour: ContourShape, name: string): MelodyCandidate {
  const rng = mulberry32(input.seed);
  const layout = layoutPhrases(input);
  const chords = makeChordLookup(input.chords, input.key, input.scale, input.timeSignature);
  const notes: GeneratedNote[] = [];
  const byText = new Map<string, { phrase: PhraseResult; layout: PhraseLayout }>();
  const byCount = new Map<number, { onsets: number[]; durations: number[] }>();
  let prev: number | null = null;
  let reusedLines = 0;
  let reusedRhythms = 0;

  input.phrases.forEach((ph, i) => {
    if (ph.tokens.length === 0) return;
    const lay = layout[i];
    const key = normalizeLine(ph.text);
    const same = byText.get(key);
    if (same && input.controls.repetition >= 0.3 && same.phrase.notes.length === ph.tokens.length) {
      // Repeated lyric line (typical for hooks): reuse the whole phrase.
      const shift = lay.startTick - same.layout.startTick;
      same.phrase.notes.forEach((n, k) => {
        notes.push({ ...n, id: `gen_${input.seed}_${ph.lineId}_${k}`, startTick: n.startTick + shift, syllableId: ph.tokens[k].id, lineId: ph.lineId });
      });
      prev = notes[notes.length - 1]?.pitch ?? prev;
      reusedLines++;
      return;
    }
    let rhythmOverride: { onsets: number[]; durations: number[] } | undefined;
    const sameCount = byCount.get(ph.tokens.length);
    if (sameCount && rng() < input.controls.repetition * 0.8) {
      rhythmOverride = sameCount;
      reusedRhythms++;
    }
    const res = generatePhrase(i, input, lay, contour, rng, prev, chords.at, rhythmOverride);
    notes.push(...res.notes);
    if (!byText.has(key)) byText.set(key, { phrase: res, layout: lay });
    if (!byCount.has(ph.tokens.length)) byCount.set(ph.tokens.length, { onsets: res.rhythm, durations: res.durations });
    prev = res.notes[res.notes.length - 1]?.pitch ?? prev;
  });

  const style = MELODY_STYLES[input.style];
  const metrics = computeMetrics(notes, input.timeSignature);
  const explanation = [
    `Style "${style.label}": ${style.description}`,
    `Contour: ${CONTOUR_LABELS[contour]}; strong-beat and long syllables use chord tones, others use ${style.scaleOverride ? "pentatonic" : "scale"} tones.`,
    chords.source === "default"
      ? "No chords in the project — used a default diatonic loop (I–V–vi–IV or i–VI–III–VII). Add chords for better fit."
      : `Chords taken from the project${chords.loopTicks ? ` and looped every ${chords.loopTicks / ticksPerBar(input.timeSignature)} bar(s)` : ""}.`,
    `Each lyric line is one phrase of ≥${input.controls.phraseBars} bar(s); longer lines get extra bars automatically.`,
    input.controls.toneAdherence > 0
      ? `Thai lexical tones are a soft preference (weight ${input.controls.toneAdherence.toFixed(2)}): rising/high tones lean upward, low tones lean downward. They are not mapped one-to-one to pitch.`
      : "Thai tone preferences are switched off.",
  ];
  if (reusedLines) explanation.push(`${reusedLines} repeated lyric line(s) reuse the earlier phrase (repetition setting).`);
  if (reusedRhythms) explanation.push(`${reusedRhythms} phrase(s) reuse an earlier rhythm with the same syllable count.`);
  if (input.plans && Object.keys(input.plans).length) explanation.push("Per-phrase guidance from the AI plan was applied to contour/density/emphasis.");

  return {
    id: `cand_${input.seed}_${contour}`,
    name,
    seed: input.seed,
    contour,
    notes,
    layout,
    metrics,
    explanation,
    chordSource: chords.source,
  };
}

/** Generate several distinct candidates by varying contour, seed and rhythm feel. */
export function generateCandidates(input: MelodyInput, count = 3): MelodyCandidate[] {
  const style = MELODY_STYLES[input.style];
  const variants: Array<{ contour: ContourShape; tweak: Partial<MelodyControls> }> = [
    { contour: style.contours[0], tweak: {} },
    { contour: style.contours[1] ?? "wave", tweak: { syncopation: Math.min(1, input.controls.syncopation + 0.2) } },
    {
      contour: style.contours[2] ?? "descending",
      tweak: {
        density: Math.max(0, Math.min(1, input.controls.density + (input.controls.density > 0.5 ? -0.2 : 0.2))),
        range: Math.min(1, input.controls.range + 0.15),
      },
    },
    { contour: "valley", tweak: { complexity: Math.min(1, input.controls.complexity + 0.3) } },
    { contour: "ascending", tweak: { intensity: Math.min(1, input.controls.intensity + 0.2) } },
  ];
  const letters = "ABCDE";
  return variants.slice(0, Math.max(1, Math.min(5, count))).map((v, i) =>
    generateMelody(
      { ...input, seed: input.seed + i * 7919, controls: { ...input.controls, ...v.tweak } },
      v.contour,
      `Candidate ${letters[i]} — ${CONTOUR_LABELS[v.contour]}`,
    ),
  );
}

/** Regenerate a single phrase of an existing candidate, keeping everything else. */
export function regeneratePhrase(
  input: MelodyInput,
  candidate: MelodyCandidate,
  lineId: string,
  newSeed: number,
): MelodyCandidate {
  const idx = input.phrases.findIndex((p) => p.lineId === lineId);
  if (idx < 0) return candidate;
  const layout = candidate.layout.length === input.phrases.length ? candidate.layout : layoutPhrases(input);
  const lay = layout[idx];
  const chords = makeChordLookup(input.chords, input.key, input.scale, input.timeSignature);
  const before = candidate.notes.filter((n) => n.startTick < lay.startTick && n.lineId !== lineId);
  const prev = before.length ? before[before.length - 1].pitch : null;
  const rng = mulberry32(newSeed);
  const res = generatePhrase(idx, { ...input, seed: newSeed }, lay, candidate.contour, rng, prev, chords.at);
  const notes = [...candidate.notes.filter((n) => n.lineId !== lineId), ...res.notes].sort(
    (a, b) => a.startTick - b.startTick,
  );
  return { ...candidate, notes, metrics: computeMetrics(notes, input.timeSignature) };
}

export function toMidiNotes(notes: GeneratedNote[]): MidiNote[] {
  return notes.map(({ id, pitch, startTick, durationTicks, velocity, syllableId }) => ({
    id: id.startsWith("gen_") ? uid("n") : id,
    pitch,
    startTick,
    durationTicks,
    velocity,
    syllableId,
  }));
}
