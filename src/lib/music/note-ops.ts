import type { MidiNote } from "@/lib/project/schema";
import { uid } from "@/lib/project/factory";
import { snapTick } from "./timing";

export const MIN_PITCH = 0;
export const MAX_PITCH = 127;

function clampPitch(p: number) {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(p)));
}

export function sortNotes(notes: MidiNote[]): MidiNote[] {
  return [...notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
}

export function addNote(notes: MidiNote[], n: Omit<MidiNote, "id"> & { id?: string }): { notes: MidiNote[]; note: MidiNote } {
  const note: MidiNote = {
    id: n.id ?? uid("n"),
    pitch: clampPitch(n.pitch),
    startTick: Math.max(0, Math.round(n.startTick)),
    durationTicks: Math.max(1, Math.round(n.durationTicks)),
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity))),
    syllableId: n.syllableId ?? null,
  };
  return { notes: [...notes, note], note };
}

export function deleteNotes(notes: MidiNote[], ids: Set<string>): MidiNote[] {
  return notes.filter((n) => !ids.has(n.id));
}

/**
 * Move notes by a tick/pitch delta. The delta is clamped as a group so the
 * selection keeps its shape at the edges (no note goes below tick 0 or out of
 * MIDI pitch range).
 */
export function moveNotes(notes: MidiNote[], ids: Set<string>, dTick: number, dPitch: number): MidiNote[] {
  const sel = notes.filter((n) => ids.has(n.id));
  if (!sel.length) return notes;
  const minStart = Math.min(...sel.map((n) => n.startTick));
  const minP = Math.min(...sel.map((n) => n.pitch));
  const maxP = Math.max(...sel.map((n) => n.pitch));
  const dt = Math.max(-minStart, Math.round(dTick));
  const dp = Math.max(MIN_PITCH - minP, Math.min(MAX_PITCH - maxP, Math.round(dPitch)));
  if (dt === 0 && dp === 0) return notes;
  return notes.map((n) => (ids.has(n.id) ? { ...n, startTick: n.startTick + dt, pitch: n.pitch + dp } : n));
}

/** Change durations by a delta, never below `minDuration`. */
export function resizeNotes(notes: MidiNote[], ids: Set<string>, dTicks: number, minDuration: number): MidiNote[] {
  return notes.map((n) =>
    ids.has(n.id) ? { ...n, durationTicks: Math.max(minDuration, Math.round(n.durationTicks + dTicks)) } : n,
  );
}

/** Resize so that the note ends at `endTick` (snapped by caller). */
export function setNoteEnd(notes: MidiNote[], id: string, endTick: number, minDuration: number): MidiNote[] {
  return notes.map((n) => (n.id === id ? { ...n, durationTicks: Math.max(minDuration, Math.round(endTick - n.startTick)) } : n));
}

export function setVelocity(notes: MidiNote[], ids: Set<string>, velocity: number): MidiNote[] {
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  return notes.map((n) => (ids.has(n.id) ? { ...n, velocity: v } : n));
}

export function updateNote(notes: MidiNote[], id: string, patch: Partial<Omit<MidiNote, "id">>): MidiNote[] {
  return notes.map((n) => {
    if (n.id !== id) return n;
    const next = { ...n, ...patch };
    next.pitch = clampPitch(next.pitch);
    next.startTick = Math.max(0, Math.round(next.startTick));
    next.durationTicks = Math.max(1, Math.round(next.durationTicks));
    next.velocity = Math.max(1, Math.min(127, Math.round(next.velocity)));
    return next;
  });
}

export function transposeNotes(notes: MidiNote[], ids: Set<string>, semitones: number): MidiNote[] {
  return moveNotes(notes, ids, 0, semitones);
}

export interface Clipboard {
  /** Notes with startTick relative to the earliest copied note. */
  notes: Array<Omit<MidiNote, "id">>;
  span: number;
}

export function copyNotes(notes: MidiNote[], ids: Set<string>): Clipboard | null {
  const sel = notes.filter((n) => ids.has(n.id));
  if (!sel.length) return null;
  const start = Math.min(...sel.map((n) => n.startTick));
  const end = Math.max(...sel.map((n) => n.startTick + n.durationTicks));
  return {
    notes: sel.map((n) => ({ pitch: n.pitch, startTick: n.startTick - start, durationTicks: n.durationTicks, velocity: n.velocity, syllableId: n.syllableId })),
    span: end - start,
  };
}

/** Paste clipboard at `atTick`. Returns the new notes and the ids of pasted notes. */
export function pasteNotes(notes: MidiNote[], clip: Clipboard, atTick: number): { notes: MidiNote[]; pastedIds: string[] } {
  const pasted = clip.notes.map((n) => ({ ...n, id: uid("n"), startTick: Math.max(0, atTick + n.startTick) }));
  return { notes: [...notes, ...pasted], pastedIds: pasted.map((n) => n.id) };
}

export function duplicateNotes(notes: MidiNote[], ids: Set<string>): { notes: MidiNote[]; pastedIds: string[] } {
  const clip = copyNotes(notes, ids);
  if (!clip) return { notes, pastedIds: [] };
  const start = Math.min(...notes.filter((n) => ids.has(n.id)).map((n) => n.startTick));
  return pasteNotes(notes, clip, start + clip.span);
}

export interface QuantizeOptions {
  grid: number;
  /** 0..1: how far notes move toward the grid. */
  strength: number;
  quantizeEnds: boolean;
}

/** Quantize note starts (and optionally ends) toward a grid. */
export function quantizeNotes(notes: MidiNote[], ids: Set<string> | null, opts: QuantizeOptions): MidiNote[] {
  const strength = Math.max(0, Math.min(1, opts.strength));
  return notes.map((n) => {
    if (ids && !ids.has(n.id)) return n;
    const target = snapTick(n.startTick, opts.grid);
    const start = Math.max(0, Math.round(n.startTick + (target - n.startTick) * strength));
    let duration = n.durationTicks;
    if (opts.quantizeEnds) {
      const end = n.startTick + n.durationTicks;
      const targetEnd = Math.max(target + opts.grid, snapTick(end, opts.grid));
      const newEnd = Math.round(end + (targetEnd - end) * strength);
      duration = Math.max(1, newEnd - start);
    }
    return { ...n, startTick: start, durationTicks: duration };
  });
}

/** Ids of notes intersecting a tick/pitch rectangle. */
export function notesInRect(
  notes: MidiNote[],
  rect: { tickStart: number; tickEnd: number; pitchLow: number; pitchHigh: number },
): string[] {
  const t0 = Math.min(rect.tickStart, rect.tickEnd);
  const t1 = Math.max(rect.tickStart, rect.tickEnd);
  const p0 = Math.min(rect.pitchLow, rect.pitchHigh);
  const p1 = Math.max(rect.pitchLow, rect.pitchHigh);
  return notes
    .filter((n) => n.pitch >= p0 && n.pitch <= p1 && n.startTick < t1 && n.startTick + n.durationTicks > t0)
    .map((n) => n.id);
}

/** Monophonic cleanup: trim each note so it ends no later than the next note starts. */
export function trimOverlaps(notes: MidiNote[]): MidiNote[] {
  const sorted = sortNotes(notes);
  const out: MidiNote[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = { ...sorted[i] };
    const next = sorted.slice(i + 1).find((m) => m.startTick > n.startTick);
    if (next && n.startTick + n.durationTicks > next.startTick) {
      n.durationTicks = Math.max(1, next.startTick - n.startTick);
    }
    out.push(n);
  }
  return out;
}
