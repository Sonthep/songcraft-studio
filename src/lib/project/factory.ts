import { PPQ, ticksPerBar } from "@/lib/music/timing";
import { presetChords, PROGRESSION_PRESETS, type ScaleName } from "@/lib/music/theory";
import type { ChordEvent, Language, LyricLine, Project, SectionType, SongSection } from "./schema";
import { SECTION_LABELS } from "./schema";

export function uid(prefix = ""): string {
  const c = globalThis.crypto;
  const raw =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${raw}` : raw;
}

export function createLine(text = ""): LyricLine {
  return { id: uid("ln"), text, syllableOverride: null };
}

export function createSection(type: SectionType, label?: string, lines: string[] = [""]): SongSection {
  return {
    id: uid("sec"),
    type,
    label: label ?? SECTION_LABELS[type],
    lines: lines.map((t) => createLine(t)),
  };
}

export interface NewProjectInput {
  title: string;
  genre?: string;
  mood?: string;
  language?: Language;
  bpm?: number;
  key?: number;
  scale?: ScaleName;
  numerator?: number;
  denominator?: 2 | 4 | 8 | 16;
  withStarterChords?: boolean;
}

export function createProject(input: NewProjectInput): Project {
  const now = Date.now();
  const ts = { numerator: input.numerator ?? 4, denominator: input.denominator ?? 4 } as Project["timeSignature"];
  const key = input.key ?? 9; // A
  const scale = input.scale ?? "minor";
  const project: Project = {
    id: uid("prj"),
    schemaVersion: 1,
    title: input.title.trim() || "Untitled Song",
    genre: input.genre ?? "R&B",
    mood: input.mood ?? "",
    language: input.language ?? "th",
    bpm: input.bpm ?? 80,
    key,
    scale,
    timeSignature: ts,
    vocalRange: { low: 55, high: 74 }, // G3–D5: a common male/female overlap
    sections: [createSection("verse"), createSection("chorus")],
    chords: [],
    notes: [],
    melodyVersions: [],
    lyricsVersions: [],
    audioAssets: [],
    flow: [],
    suno: null,
    notesText: "",
    createdAt: now,
    updatedAt: now,
  };
  if (input.withStarterChords !== false) {
    const preset = PROGRESSION_PRESETS[0];
    project.chords = chordsFromSpecs(presetChords(preset, key, scale), ticksPerBar(ts), 0);
  }
  return project;
}

export function chordsFromSpecs(
  specs: Array<{ root: number; quality: ChordEvent["quality"]; bass?: number | null }>,
  durationTicks: number,
  startTick = 0,
): ChordEvent[] {
  return specs.map((s, i) => ({
    id: uid("ch"),
    root: s.root,
    quality: s.quality,
    bass: s.bass ?? null,
    startTick: startTick + i * durationTicks,
    durationTicks,
    inversion: 0,
    octave: 3,
    spread: false,
  }));
}

/** Deep copy with fresh ids for the project itself (child ids are kept; they are project-scoped). */
export function duplicateProject(p: Project): Project {
  const copy: Project = structuredClone(p);
  const now = Date.now();
  copy.id = uid("prj");
  copy.title = `${p.title} (copy)`;
  copy.createdAt = now;
  copy.updatedAt = now;
  // Audio blobs are stored per asset id; duplicating references would share blobs, so drop them.
  copy.audioAssets = [];
  return copy;
}

/** Length of the song content in ticks (max of notes/chords end), at least 4 bars. */
export function projectLengthTicks(p: Project): number {
  let end = 0;
  for (const n of p.notes) end = Math.max(end, n.startTick + n.durationTicks);
  for (const c of p.chords) end = Math.max(end, c.startTick + c.durationTicks);
  const bar = ticksPerBar(p.timeSignature);
  return Math.max(bar * 4, Math.ceil(end / bar) * bar);
}

export const DEFAULT_NOTE_VELOCITY = 96;
export const DEFAULT_NOTE_LENGTH = PPQ / 2;
