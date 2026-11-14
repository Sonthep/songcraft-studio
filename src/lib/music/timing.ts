/**
 * Musical timing model. All editor positions are stored in ticks with a fixed
 * resolution of PPQ pulses per quarter note. Pixels are derived, never stored.
 */

export const PPQ = 480;

export interface TimeSignature {
  numerator: number;
  denominator: number; // 2, 4, 8 or 16
}

export function ticksPerBeat(ts: TimeSignature): number {
  return (PPQ * 4) / ts.denominator;
}

export function ticksPerBar(ts: TimeSignature): number {
  return ts.numerator * ticksPerBeat(ts);
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}

export function secondsToTicks(seconds: number, bpm: number): number {
  return (seconds * bpm * PPQ) / 60;
}

export interface GridOption {
  id: string;
  label: string;
  ticks: number;
  triplet: boolean;
}

export const GRID_OPTIONS: GridOption[] = [
  { id: "1/4", label: "1/4", ticks: PPQ, triplet: false },
  { id: "1/8", label: "1/8", ticks: PPQ / 2, triplet: false },
  { id: "1/16", label: "1/16", ticks: PPQ / 4, triplet: false },
  { id: "1/32", label: "1/32", ticks: PPQ / 8, triplet: false },
  { id: "1/4T", label: "1/4 T", ticks: (PPQ * 2) / 3, triplet: true },
  { id: "1/8T", label: "1/8 T", ticks: PPQ / 3, triplet: true },
  { id: "1/16T", label: "1/16 T", ticks: PPQ / 6, triplet: true },
];

export function gridById(id: string): GridOption {
  return GRID_OPTIONS.find((g) => g.id === id) ?? GRID_OPTIONS[2];
}

export function snapTick(tick: number, grid: number, mode: "round" | "floor" | "ceil" = "round"): number {
  if (grid <= 0) return Math.round(tick);
  const q = tick / grid;
  const n = mode === "floor" ? Math.floor(q + 1e-9) : mode === "ceil" ? Math.ceil(q - 1e-9) : Math.round(q);
  return Math.round(n * grid);
}

export interface BarBeat {
  bar: number; // 1-based
  beat: number; // 1-based
  tick: number; // remaining ticks inside the beat
}

export function tickToBarBeat(tick: number, ts: TimeSignature): BarBeat {
  const tpb = ticksPerBeat(ts);
  const tpBar = ticksPerBar(ts);
  const t = Math.max(0, Math.floor(tick));
  const bar = Math.floor(t / tpBar);
  const inBar = t - bar * tpBar;
  const beat = Math.floor(inBar / tpb);
  return { bar: bar + 1, beat: beat + 1, tick: inBar - beat * tpb };
}

export function barBeatToTick(pos: BarBeat, ts: TimeSignature): number {
  return (pos.bar - 1) * ticksPerBar(ts) + (pos.beat - 1) * ticksPerBeat(ts) + pos.tick;
}

/** "bar.beat.sixteenth" display, e.g. 3.2.1 */
export function formatBarBeat(tick: number, ts: TimeSignature): string {
  const { bar, beat, tick: rest } = tickToBarBeat(tick, ts);
  const sixteenth = Math.floor(rest / (ticksPerBeat(ts) / 4)) + 1;
  return `${bar}.${beat}.${sixteenth}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

/** Is the tick on a beat boundary (within tolerance)? */
export function isOnBeat(tick: number, ts: TimeSignature): boolean {
  return tick % ticksPerBeat(ts) === 0;
}

/** Metric strength of a position: 3 = downbeat, 2 = beat, 1 = half-beat, 0 = weaker. */
export function metricStrength(tick: number, ts: TimeSignature): number {
  const tpBar = ticksPerBar(ts);
  const tpb = ticksPerBeat(ts);
  const inBar = ((tick % tpBar) + tpBar) % tpBar;
  if (inBar === 0) return 3;
  if (inBar % tpb === 0) return 2;
  if (inBar % (tpb / 2) === 0) return 1;
  return 0;
}
