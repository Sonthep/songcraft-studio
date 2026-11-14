import type { FlowSection, MidiNote } from "@/lib/project/schema";
import type { SyllableToken } from "@/lib/lyrics/syllables";
import { ticksPerBeat, type TimeSignature } from "@/lib/music/timing";
import { uid } from "@/lib/project/factory";

export type SlotsPerBeat = FlowSection["slotsPerBeat"];

export type FlowPattern = "straight" | "onbeat" | "syncopated" | "laidBack" | "triplet" | "doubleTime";

export const FLOW_PATTERNS: Record<FlowPattern, { label: string; description: string; slotsPerBeat: SlotsPerBeat }> = {
  straight: { label: "Straight 16ths", description: "Evenly spread across the bar on a 16th grid.", slotsPerBeat: 4 },
  onbeat: { label: "On-beat 8ths", description: "Syllables on 8th notes from the downbeat; simple and punchy.", slotsPerBeat: 4 },
  syncopated: { label: "Syncopated", description: "Starts on the 'e', alternates short/long gaps, lands off the beat.", slotsPerBeat: 4 },
  laidBack: { label: "Laid-back", description: "Starts a beat late and leaves space at the front of the bar.", slotsPerBeat: 4 },
  triplet: { label: "Triplet flow", description: "Consecutive 8th-note triplets (3 per beat).", slotsPerBeat: 3 },
  doubleTime: { label: "Double-time", description: "Consecutive 32nds (8 per beat), fast chopper-style delivery.", slotsPerBeat: 8 },
};

export interface FlowLine {
  lineId: string;
  tokens: SyllableToken[];
  /** Token id of the line's end rhyme, if detected. */
  endRhymeTokenId?: string | null;
}

export function slotsPerBar(spb: number, ts: TimeSignature): number {
  return spb * ts.numerator;
}

export function slotTicks(spb: number, ts: TimeSignature): number {
  return ticksPerBeat(ts) / spb;
}

export interface ArrangeResult {
  placements: Record<string, number>;
  warnings: string[];
}

export function autoArrange(
  lines: FlowLine[],
  pattern: FlowPattern,
  spb: SlotsPerBeat,
  barsPerLine: number,
  ts: TimeSignature,
  landRhymesOnBeat = true,
): ArrangeResult {
  const placements: Record<string, number> = {};
  const warnings: string[] = [];
  const perBar = slotsPerBar(spb, ts);
  const lineSlots = perBar * barsPerLine;
  lines.forEach((line, li) => {
    const base = li * lineSlots;
    const n = line.tokens.length;
    if (!n) return;
    let start = 0;
    let steps: number[] = [];
    switch (pattern) {
      case "straight": {
        const room = lineSlots - spb; // leave a beat of rest
        const step = Math.max(1, Math.floor(room / n));
        steps = Array(n).fill(step);
        break;
      }
      case "onbeat": {
        const eighth = Math.max(1, Math.round(spb / 2));
        const step = n * eighth <= lineSlots - spb ? eighth : 1;
        steps = Array(n).fill(step);
        break;
      }
      case "syncopated": {
        start = Math.min(1, lineSlots - n);
        steps = Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 2 : 1));
        if (start + steps.slice(0, -1).reduce((a, b) => a + b, 0) >= lineSlots) steps = Array(n).fill(1);
        break;
      }
      case "laidBack": {
        start = spb;
        const room = lineSlots - start;
        const step = Math.max(1, Math.floor(room / n));
        steps = Array(n).fill(step);
        if (n > room) {
          start = 0;
          steps = Array(n).fill(1);
        }
        break;
      }
      case "triplet":
      case "doubleTime":
        steps = Array(n).fill(1);
        break;
    }
    // If the pattern overruns the line, fall back to consecutive slots that end inside it.
    const lastOffset = start + steps.slice(0, -1).reduce((a, b) => a + b, 0);
    if (lastOffset >= lineSlots) {
      start = Math.max(0, Math.min(start, lineSlots - n));
      steps = Array(n).fill(1);
    }
    let pos = start;
    line.tokens.forEach((t, i) => {
      placements[t.id] = base + pos;
      pos += steps[i];
    });
    if (n > lineSlots) warnings.push(`Line ${li + 1} has ${n} syllables but only ${lineSlots} slots — it spills into the next bar.`);

    // Land the end rhyme on the last beat of the line when there is room.
    if (landRhymesOnBeat && pattern !== "doubleTime" && line.endRhymeTokenId) {
      const lastTok = line.tokens[n - 1];
      if (lastTok.id === line.endRhymeTokenId) {
        const target = base + lineSlots - spb;
        const prev = n >= 2 ? placements[line.tokens[n - 2].id] : base - 1;
        if (target > prev && target > placements[lastTok.id]) placements[lastTok.id] = target;
      }
    }
  });
  return { placements, warnings };
}

/** Move one syllable to a slot. If the slot is taken, the two syllables swap. */
export function moveSyllable(placements: Record<string, number>, id: string, toSlot: number): Record<string, number> {
  const from = placements[id];
  const next = { ...placements };
  const occupant = Object.keys(placements).find((k) => placements[k] === toSlot && k !== id);
  next[id] = Math.max(0, toSlot);
  if (occupant !== undefined && from !== undefined) next[occupant] = from;
  return next;
}

/** Shift every syllable of a line by `delta` slots (keeps order). */
export function shiftLine(placements: Record<string, number>, tokenIds: string[], delta: number): Record<string, number> {
  const next = { ...placements };
  const min = Math.min(...tokenIds.map((id) => placements[id] ?? 0));
  const d = Math.max(-min, delta);
  for (const id of tokenIds) if (next[id] !== undefined) next[id] += d;
  return next;
}

export interface BarStats {
  bar: number;
  syllables: number;
  slots: number;
  density: number;
  offbeat: number;
}

export function flowStats(placements: Record<string, number>, spb: number, ts: TimeSignature): BarStats[] {
  const perBar = slotsPerBar(spb, ts);
  const values = Object.values(placements);
  if (!values.length) return [];
  const bars = Math.floor(Math.max(...values) / perBar) + 1;
  const out: BarStats[] = Array.from({ length: bars }, (_, b) => ({ bar: b + 1, syllables: 0, slots: perBar, density: 0, offbeat: 0 }));
  for (const v of values) {
    const b = Math.floor(v / perBar);
    out[b].syllables++;
    if (v % spb !== 0) out[b].offbeat++;
  }
  for (const s of out) s.density = s.syllables / s.slots;
  return out;
}

/** Convert placements into MIDI notes for preview/export (monotone with accents). */
export function flowToNotes(
  placements: Record<string, number>,
  tokens: SyllableToken[],
  spb: number,
  ts: TimeSignature,
  startTick: number,
  pitch: number,
): MidiNote[] {
  const st = slotTicks(spb, ts);
  const placed = tokens
    .filter((t) => placements[t.id] !== undefined)
    .map((t) => ({ t, slot: placements[t.id] }))
    .sort((a, b) => a.slot - b.slot);
  return placed.map(({ t, slot }, i) => {
    const nextSlot = placed[i + 1]?.slot ?? slot + 2;
    const len = Math.max(1, Math.min(2, nextSlot - slot));
    return {
      id: uid("n"),
      pitch,
      startTick: startTick + Math.round(slot * st),
      durationTicks: Math.max(1, Math.round(len * st * 0.85)),
      velocity: t.stressed ? 112 : 84,
      syllableId: t.id,
    };
  });
}
