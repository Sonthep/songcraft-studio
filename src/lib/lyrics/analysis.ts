import type { SongSection } from "@/lib/project/schema";
import type { CustomIndex } from "./custom-dictionary";
import { compareRhymeUnits, rhymeKey, type RhymeUnit } from "./rhyme";
import { segmentLine, type PronunciationMap, type SyllableToken } from "./syllables";

export interface LineAnalysis {
  lineId: string;
  text: string;
  tokens: SyllableToken[];
  syllableCount: number;
  endToken: SyllableToken | null;
  endRhyme: RhymeUnit | null;
  /** Rhyme-scheme letter (A, B, …) or null for empty lines. */
  letter: string | null;
  /** Index of the end-rhyme group used for coloring (only if ≥2 lines share it). */
  endGroup: number | null;
  /** Alliteration (สัมผัสอักษร): syllables in this line that share an initial sound. */
  alliterations: AlliterationGroup[];
}

export interface AlliterationGroup {
  /** Section-wide group index (same sound = same color). */
  group: number;
  label: string;
  tokenIds: string[];
  texts: string[];
  approximate: boolean;
}

export interface SectionAnalysis {
  sectionId: string;
  lines: LineAnalysis[];
  scheme: string;
  /** token id -> internal rhyme group index (for highlighting). */
  internal: Record<string, number>;
  /** token id -> alliteration group index (for highlighting). */
  alliteration: Record<string, number>;
  averageSyllables: number;
  syllableSpread: number;
}

export interface WordRepetition {
  word: string;
  count: number;
  content: boolean;
}

export interface LyricsAnalysis {
  sections: SectionAnalysis[];
  tokensById: Record<string, SyllableToken>;
  repetitions: WordRepetition[];
  totalSyllables: number;
}

const END_RHYME_THRESHOLD = 0.7;

function letterFor(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `Z${i - 25}`;
}

export function analyzeSection(
  section: SongSection,
  pron?: PronunciationMap,
  custom?: CustomIndex,
  groupOffset = 0,
): SectionAnalysis {
  const lines: LineAnalysis[] = section.lines.map((line) => {
    const tokens = segmentLine(line, pron, custom);
    const endToken = [...tokens].reverse().find((t) => t.rhyme) ?? null;
    return {
      lineId: line.id,
      text: line.text,
      tokens,
      syllableCount: tokens.length,
      endToken,
      endRhyme: endToken ? (endToken.wordRhyme ?? endToken.rhyme) : null,
      letter: null,
      endGroup: null,
      alliterations: [],
    };
  });

  // Rhyme scheme letters: greedy clustering of line endings.
  const reps: RhymeUnit[] = [];
  const counts: number[] = [];
  const lineGroup: Array<number | null> = lines.map((l) => {
    if (!l.endRhyme) return null;
    let best = -1;
    let bestScore = 0;
    reps.forEach((r, gi) => {
      const c = compareRhymeUnits(l.endRhyme!, r);
      if (c.score >= END_RHYME_THRESHOLD && c.score > bestScore) {
        best = gi;
        bestScore = c.score;
      }
    });
    if (best < 0) {
      reps.push(l.endRhyme);
      counts.push(1);
      return reps.length - 1;
    }
    counts[best]++;
    return best;
  });
  let colorIdx = groupOffset;
  const groupColor = new Map<number, number>();
  lines.forEach((l, i) => {
    const g = lineGroup[i];
    if (g == null) return;
    l.letter = letterFor(g);
    if (counts[g] >= 2) {
      if (!groupColor.has(g)) groupColor.set(g, colorIdx++);
      l.endGroup = groupColor.get(g)!;
    }
  });

  // Internal rhymes: exact key matches within a line and its neighbors, excluding weak syllables.
  const internal: Record<string, number> = {};
  const keyGroup = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const windowTokens = [lines[i - 1], lines[i], lines[i + 1]].filter(Boolean).flatMap((l) => l!.tokens);
    const counter = new Map<string, number>();
    for (const t of windowTokens) {
      if (!isRhymeCandidate(t)) continue;
      const k = rhymeKey(t.rhyme!);
      counter.set(k, (counter.get(k) ?? 0) + 1);
    }
    for (const t of lines[i].tokens) {
      if (!isRhymeCandidate(t)) continue;
      const k = rhymeKey(t.rhyme!);
      if ((counter.get(k) ?? 0) < 2) continue;
      if (!keyGroup.has(k)) keyGroup.set(k, keyGroup.size);
      internal[t.id] = keyGroup.get(k)!;
    }
  }

  // Alliteration: content syllables in the same line that start with the same sound.
  const alliteration: Record<string, number> = {};
  const soundGroup = new Map<string, number>();
  for (const l of lines) {
    const bySound = new Map<string, SyllableToken[]>();
    for (const t of l.tokens) {
      if (!isAlliterationCandidate(t)) continue;
      const k = t.onset!.key;
      bySound.set(k, [...(bySound.get(k) ?? []), t]);
    }
    for (const [k, ts] of bySound) {
      if (ts.length < 2) continue;
      if (!soundGroup.has(k)) soundGroup.set(k, soundGroup.size);
      const group = soundGroup.get(k)!;
      for (const t of ts) alliteration[t.id] = group;
      l.alliterations.push({
        group,
        label: ts[0].onset!.label,
        tokenIds: ts.map((t) => t.id),
        texts: ts.map((t) => t.text),
        approximate: ts.some((t) => t.onset!.approximate || t.confidence < 0.7),
      });
    }
  }

  const counted = lines.filter((l) => l.syllableCount > 0);
  const avg = counted.length ? counted.reduce((n, l) => n + l.syllableCount, 0) / counted.length : 0;
  const spread = counted.length
    ? Math.max(...counted.map((l) => l.syllableCount)) - Math.min(...counted.map((l) => l.syllableCount))
    : 0;

  return {
    sectionId: section.id,
    lines,
    scheme: lines.map((l) => l.letter ?? "-").join(""),
    internal,
    alliteration,
    averageSyllables: avg,
    syllableSpread: spread,
  };
}

function isRhymeCandidate(t: SyllableToken): boolean {
  if (!t.rhyme || t.confidence < 0.5) return false;
  // Open short "a" (สะ, ขะ…) is too common to be a meaningful internal rhyme.
  if (t.lang === "th" && t.rhyme.vowel === "a" && !t.rhyme.long && t.rhyme.coda === "") return false;
  if (t.lang === "en" && !t.stressed) return false;
  return true;
}

function isAlliterationCandidate(t: SyllableToken): boolean {
  if (!t.onset || !t.content || t.confidence < 0.5) return false;
  if (t.lang === "en") return t.stressed;
  return t.lang === "th";
}

export function analyzeLyrics(sections: SongSection[], pron?: PronunciationMap, custom?: CustomIndex): LyricsAnalysis {
  const out: SectionAnalysis[] = [];
  let offset = 0;
  const tokensById: Record<string, SyllableToken> = {};
  const wordCounts = new Map<string, WordRepetition>();
  let total = 0;
  for (const s of sections) {
    const a = analyzeSection(s, pron, custom, offset);
    offset += new Set(a.lines.map((l) => l.endGroup).filter((g) => g != null)).size;
    out.push(a);
    for (const l of a.lines) {
      total += l.syllableCount;
      let lastWord = -1;
      for (const t of l.tokens) {
        tokensById[t.id] = t;
        if (t.wordIndex !== lastWord) {
          lastWord = t.wordIndex;
          const w = t.word.toLowerCase();
          const rec = wordCounts.get(w) ?? { word: t.word, count: 0, content: t.content };
          rec.count++;
          wordCounts.set(w, rec);
        }
      }
    }
  }
  const repetitions = [...wordCounts.values()]
    .filter((w) => w.count >= 2)
    .sort((a, b) => Number(b.content) - Number(a.content) || b.count - a.count);
  return { sections: out, tokensById, repetitions, totalSyllables: total };
}

/** Distinct, accessible highlight colors for rhyme groups (work on dark backgrounds). */
export const RHYME_COLORS = [
  "#5eead4", // teal
  "#c4b5fd", // violet
  "#fcd34d", // amber
  "#f9a8d4", // pink
  "#93c5fd", // blue
  "#bef264", // lime
  "#fdba74", // orange
  "#a5b4fc", // indigo
  "#86efac", // green
  "#fca5a5", // red
];

export function rhymeColor(group: number): string {
  return RHYME_COLORS[group % RHYME_COLORS.length];
}
