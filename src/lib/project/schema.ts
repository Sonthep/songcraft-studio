import { z } from "zod";
import { CHORD_QUALITY_NAMES, SCALE_NAMES, type ChordQuality, type ScaleName } from "@/lib/music/theory";

export const LANGUAGES = ["th", "isan", "en", "mixed"] as const;
export const LANGUAGE_LABELS: Record<(typeof LANGUAGES)[number], string> = {
  th: "Thai",
  isan: "Isan",
  en: "English",
  mixed: "Mixed",
};

export const SECTION_TYPES = [
  "intro",
  "verse",
  "preChorus",
  "chorus",
  "hook",
  "bridge",
  "rapVerse",
  "outro",
] as const;

export const SECTION_LABELS: Record<(typeof SECTION_TYPES)[number], string> = {
  intro: "Intro",
  verse: "Verse",
  preChorus: "Pre-Chorus",
  chorus: "Chorus",
  hook: "Hook",
  bridge: "Bridge",
  rapVerse: "Rap Verse",
  outro: "Outro",
};

export const GENRES = [
  "Hip-Hop",
  "Melodic Rap",
  "R&B",
  "Pop Ballad",
  "Thai Pop",
  "Isan / Luk Thung",
  "Pop",
  "Other",
] as const;

const id = z.string().min(1).max(64);
const pitch = z.number().int().min(0).max(127);
const tick = z.number().int().min(0).max(1_000_000_000);

export const lyricLineSchema = z.object({
  id,
  text: z.string().max(2000),
  /** Manual syllable segmentation; null means "use automatic analysis". */
  syllableOverride: z.array(z.string().max(64)).max(200).nullable().default(null),
});

export const songSectionSchema = z.object({
  id,
  type: z.enum(SECTION_TYPES),
  label: z.string().max(80),
  lines: z.array(lyricLineSchema).max(400),
});

export const midiNoteSchema = z.object({
  id,
  pitch,
  startTick: tick,
  durationTicks: z.number().int().min(1).max(10_000_000),
  velocity: z.number().int().min(1).max(127),
  syllableId: z.string().max(140).nullable().default(null),
});

export const chordEventSchema = z.object({
  id,
  root: z.number().int().min(0).max(11),
  quality: z.enum(CHORD_QUALITY_NAMES as [ChordQuality, ...ChordQuality[]]),
  bass: z.number().int().min(0).max(11).nullable().default(null),
  startTick: tick,
  durationTicks: z.number().int().min(1).max(10_000_000),
  inversion: z.number().int().min(0).max(4).default(0),
  octave: z.number().int().min(1).max(7).default(3),
  spread: z.boolean().default(false),
});

export const melodyVersionSchema = z.object({
  id,
  name: z.string().max(120),
  createdAt: z.number(),
  source: z.enum(["manual", "rule-based", "ai-guided", "hum", "import", "flow"]),
  notes: z.array(midiNoteSchema).max(20000),
});

export const lyricsVersionSchema = z.object({
  id,
  name: z.string().max(120),
  createdAt: z.number(),
  sections: z.array(songSectionSchema).max(100),
});

export const audioAssetSchema = z.object({
  id,
  kind: z.enum(["take", "reference", "hum", "render"]),
  name: z.string().max(200),
  mimeType: z.string().max(100),
  durationSec: z.number().min(0),
  sizeBytes: z.number().int().min(0),
  createdAt: z.number(),
  /** Offset in seconds of the take relative to song start (when recorded with backing). */
  offsetSec: z.number().default(0),
  notes: z.string().max(1000).default(""),
});

export const flowSectionSchema = z.object({
  sectionId: id,
  /** Slots per beat: 4 = 16ths, 3 = 8th triplets, 6 = 16th triplets, 8 = 32nds (double-time). */
  slotsPerBeat: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(8)]),
  barsPerLine: z.number().int().min(1).max(4).default(1),
  /** syllableId -> absolute slot index inside the section. */
  placements: z.record(z.string(), z.number().int().min(0).max(100000)),
});

export const sunoDraftSchema = z.object({
  genre: z.string().max(400),
  mood: z.string().max(400),
  tempo: z.string().max(100),
  vocals: z.string().max(400),
  arrangement: z.string().max(600),
  extra: z.string().max(600),
});

export const projectSchema = z.object({
  id,
  schemaVersion: z.literal(1),
  title: z.string().min(1).max(160),
  genre: z.string().max(80),
  mood: z.string().max(120),
  language: z.enum(LANGUAGES),
  bpm: z.number().min(30).max(300),
  key: z.number().int().min(0).max(11),
  scale: z.enum(SCALE_NAMES as [ScaleName, ...ScaleName[]]),
  timeSignature: z.object({
    numerator: z.number().int().min(1).max(16),
    denominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
  }),
  vocalRange: z.object({ low: pitch, high: pitch }),
  sections: z.array(songSectionSchema).max(100),
  chords: z.array(chordEventSchema).max(2000),
  notes: z.array(midiNoteSchema).max(20000),
  melodyVersions: z.array(melodyVersionSchema).max(200),
  lyricsVersions: z.array(lyricsVersionSchema).max(200),
  audioAssets: z.array(audioAssetSchema).max(500),
  flow: z.array(flowSectionSchema).max(100),
  suno: sunoDraftSchema.nullable().default(null),
  notesText: z.string().max(20000).default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Language = (typeof LANGUAGES)[number];
export type SectionType = (typeof SECTION_TYPES)[number];
export type LyricLine = z.infer<typeof lyricLineSchema>;
export type SongSection = z.infer<typeof songSectionSchema>;
export type MidiNote = z.infer<typeof midiNoteSchema>;
export type ChordEvent = z.infer<typeof chordEventSchema>;
export type MelodyVersion = z.infer<typeof melodyVersionSchema>;
export type LyricsVersion = z.infer<typeof lyricsVersionSchema>;
export type AudioAsset = z.infer<typeof audioAssetSchema>;
export type FlowSection = z.infer<typeof flowSectionSchema>;
export type SunoDraft = z.infer<typeof sunoDraftSchema>;
export type Project = z.infer<typeof projectSchema>;

/** Portable export envelope (audio blobs are not embedded). */
export const projectExportSchema = z.object({
  format: z.literal("songcraft-project"),
  version: z.literal(1),
  exportedAt: z.number(),
  project: projectSchema,
});
export type ProjectExport = z.infer<typeof projectExportSchema>;
