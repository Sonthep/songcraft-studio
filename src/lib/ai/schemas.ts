import { z } from "zod";

/**
 * Request/response contracts for AI routes. Responses are requested as
 * structured JSON from the provider and validated again with these schemas.
 * Output schemas avoid numeric bounds (not all structured-output backends
 * support them); ranges are enforced in post-processing instead.
 */

export const SUGGESTION_MODES = ["conservative", "creative", "experimental"] as const;
export type SuggestionMode = (typeof SUGGESTION_MODES)[number];

export const LYRICS_TASKS = [
  "analyze",
  "hooks",
  "rephrase",
  "rhyme",
  "emotion",
  "flow",
  "syllables",
  "phrasing",
] as const;
export type LyricsTask = (typeof LYRICS_TASKS)[number];

export const LYRICS_TASK_LABELS: Record<LyricsTask, string> = {
  analyze: "Analyze song structure",
  hooks: "Suggest stronger hooks",
  rephrase: "Alternative phrasing",
  rhyme: "Improve rhyme placement",
  emotion: "Emotional progression",
  flow: "Rap flow patterns",
  syllables: "Syllable adjustments",
  phrasing: "Find unnatural phrasing",
};

const contextSchema = z.object({
  title: z.string().max(160),
  genre: z.string().max(80),
  mood: z.string().max(120),
  language: z.string().max(20),
  bpm: z.number().min(30).max(300),
  key: z.string().max(40),
});

const lineInputSchema = z.object({
  id: z.string().max(64),
  text: z.string().max(400),
  syllables: z.number().int().min(0).max(200),
  endRhyme: z.string().max(40).optional(),
});

const sectionInputSchema = z.object({
  id: z.string().max(64),
  label: z.string().max(80),
  type: z.string().max(20),
  lines: z.array(lineInputSchema).max(80),
});

export const lyricsRequestSchema = z.object({
  task: z.enum(LYRICS_TASKS),
  mode: z.enum(SUGGESTION_MODES),
  context: contextSchema,
  sections: z.array(sectionInputSchema).min(1).max(40),
  focusLineIds: z.array(z.string().max(64)).max(80).optional(),
  note: z.string().max(1000).optional(),
});
export type LyricsRequest = z.infer<typeof lyricsRequestSchema>;

export const lyricsResponseSchema = z.object({
  summary: z.string(),
  suggestions: z.array(
    z.object({
      lineId: z.string().describe('Id of the line this applies to, or "" for a general/section-level note'),
      category: z.string().describe("Short label, e.g. hook, rhyme, phrasing, emotion, flow, syllables"),
      issue: z.string().describe("What could be improved and why, in plain language"),
      alternatives: z.array(
        z.object({
          text: z.string().describe("Full replacement line text in the song's language(s)"),
          rationale: z.string(),
        }),
      ),
    }),
  ),
  structureNotes: z.array(z.string()),
});
export type LyricsResponse = z.infer<typeof lyricsResponseSchema>;

export const COACH_TOPICS = [
  "topline",
  "vocalRhythm",
  "melodicContour",
  "hookWriting",
  "chordProgressions",
  "songStructure",
  "rhymeSchemes",
  "rapFlow",
  "vocalPhrasing",
] as const;
export type CoachTopic = (typeof COACH_TOPICS)[number];

export const COACH_TOPIC_LABELS: Record<CoachTopic, string> = {
  topline: "Topline Composition",
  vocalRhythm: "Vocal Rhythm",
  melodicContour: "Melodic Contour",
  hookWriting: "Hook Writing",
  chordProgressions: "Chord Progressions",
  songStructure: "Song Structure",
  rhymeSchemes: "Rhyme Schemes",
  rapFlow: "Rap Flow",
  vocalPhrasing: "Vocal Phrasing",
};

export const coachRequestSchema = z.object({
  topic: z.enum(COACH_TOPICS),
  context: contextSchema,
  lyrics: z.string().max(12000),
  /** Deterministic measurements computed in the app (so the coach can cite evidence). */
  measurements: z.array(z.string().max(300)).max(60),
  question: z.string().max(1000).optional(),
});
export type CoachRequest = z.infer<typeof coachRequestSchema>;

export const coachResponseSchema = z.object({
  overview: z.string(),
  observations: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      evidence: z.string().describe("Specific line, measurement or bar this is based on"),
    }),
  ),
  exercises: z.array(
    z.object({
      title: z.string(),
      goal: z.string(),
      steps: z.array(z.string()),
    }),
  ),
  concept: z.string().describe("Short explanation of the underlying songwriting concept"),
});
export type CoachResponse = z.infer<typeof coachResponseSchema>;

export const flowRequestSchema = z.object({
  context: contextSchema,
  slotsPerBeat: z.number().int().min(2).max(8),
  beatsPerBar: z.number().int().min(1).max(16),
  barsPerLine: z.number().int().min(1).max(4),
  lines: z
    .array(
      z.object({
        lineId: z.string().max(64),
        lineIndex: z.number().int().min(0).max(200),
        syllables: z
          .array(z.object({ id: z.string().max(140), text: z.string().max(40), stressed: z.boolean(), rhyme: z.string().max(40) }))
          .max(64),
      }),
    )
    .min(1)
    .max(32),
  note: z.string().max(600).optional(),
});
export type FlowRequest = z.infer<typeof flowRequestSchema>;

export const flowResponseSchema = z.object({
  arrangements: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      placements: z.array(
        z.object({
          syllableId: z.string(),
          slot: z.number().describe("Slot index within the line (0-based)"),
        }),
      ),
    }),
  ),
});
export type FlowResponse = z.infer<typeof flowResponseSchema>;

export const sunoRequestSchema = z.object({
  context: contextSchema,
  draft: z.object({
    genre: z.string().max(400),
    mood: z.string().max(400),
    tempo: z.string().max(100),
    vocals: z.string().max(400),
    arrangement: z.string().max(600),
    extra: z.string().max(600),
  }),
  lyricsExcerpt: z.string().max(4000),
  instruction: z.string().max(600).optional(),
});
export type SunoRequest = z.infer<typeof sunoRequestSchema>;

export const sunoResponseSchema = z.object({
  genre: z.string(),
  mood: z.string(),
  tempo: z.string(),
  vocals: z.string(),
  arrangement: z.string(),
  extra: z.string(),
  notes: z.string().describe("Brief explanation of what changed and why"),
});
export type SunoResponse = z.infer<typeof sunoResponseSchema>;

export const CONTOURS = ["arch", "descending", "ascending", "wave", "flat", "valley"] as const;

export const melodyPlanRequestSchema = z.object({
  context: contextSchema,
  style: z.string().max(40),
  phrases: z
    .array(
      z.object({
        lineId: z.string().max(64),
        sectionType: z.string().max(20),
        syllables: z.array(z.object({ text: z.string().max(40), tone: z.string().max(12) })).max(64),
      }),
    )
    .min(1)
    .max(40),
});
export type MelodyPlanRequest = z.infer<typeof melodyPlanRequestSchema>;

export const melodyPlanResponseSchema = z.object({
  phrases: z.array(
    z.object({
      lineId: z.string(),
      contour: z.enum(CONTOURS),
      peakSyllableIndex: z.number().describe("0-based index of the syllable that should be the melodic peak"),
      density: z.number().describe("0 to 1 rhythmic density"),
      syncopation: z.number().describe("0 to 1 syncopation"),
      emphasisIndices: z.array(z.number()).describe("0-based syllable indices to emphasise"),
      rationale: z.string(),
    }),
  ),
});
export type MelodyPlanResponse = z.infer<typeof melodyPlanResponseSchema>;

export interface AIStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
}

export interface AIErrorBody {
  error: string;
  code: "not_configured" | "invalid_request" | "rate_limited" | "auth" | "refused" | "provider_error" | "bad_output";
}
