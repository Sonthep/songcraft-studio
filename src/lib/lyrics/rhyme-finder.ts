import { THAI_WORDS, ISAN_WORDS } from "./data/thai-words";
import { analyzeThaiSyllable, containsThai, segmentThaiWord, type ThaiSyllable } from "./thai";
import { compareMulti, compareRhymeUnits, thaiRhymeUnit, type RhymeComparison, type RhymeUnit } from "./rhyme";
import { applyCustomOverride, type CustomRhymeEntry } from "./custom-dictionary";
import { thaiOnsetSound } from "./onset";

export type WordSource = "built-in" | "isan" | "custom" | "lyrics";

export interface RhymeResult {
  word: string;
  source: WordSource;
  meaning?: string;
  syllables: ThaiSyllable[];
  comparison: RhymeComparison;
  /** Number of trailing syllables that rhyme (≥2 = multisyllabic). */
  multi: number;
  score: number;
}

export interface AnalyzedWord {
  word: string;
  syllables: ThaiSyllable[];
  units: RhymeUnit[];
  last: RhymeUnit | null;
}

export function analyzeThaiWordForRhyme(word: string, custom?: CustomRhymeEntry): AnalyzedWord {
  const clean = word.replace(/[^฀-๿]/g, "");
  let syllables: ThaiSyllable[];
  if (custom?.syllables) {
    syllables = custom.syllables
      .split(/[-·|\s]+/)
      .filter(Boolean)
      .map((p) => analyzeThaiSyllable(p));
  } else {
    syllables = segmentThaiWord(clean);
  }
  const units = syllables.map(thaiRhymeUnit);
  if (units.length) {
    const overridden = applyCustomOverride(units[units.length - 1], custom);
    if (overridden) units[units.length - 1] = overridden;
  }
  return { word: clean, syllables, units, last: units[units.length - 1] ?? null };
}

export interface FindOptions {
  custom: CustomRhymeEntry[];
  lyricWords?: string[];
  minScore?: number;
  limit?: number;
}

/** Find Thai/Isan rhymes for a Thai query word across built-in, Isan, custom and lyric vocabularies. */
export function findThaiRhymes(query: string, opts: FindOptions): { target: AnalyzedWord | null; results: RhymeResult[] } {
  const q = query.trim();
  if (!q || !containsThai(q)) return { target: null, results: [] };
  const customByWord = new Map(opts.custom.map((c) => [c.word.trim(), c]));
  const target = analyzeThaiWordForRhyme(q, customByWord.get(q));
  if (!target.last) return { target, results: [] };

  const pool = new Map<string, { source: WordSource; meaning?: string }>();
  for (const w of THAI_WORDS) if (!pool.has(w)) pool.set(w, { source: "built-in" });
  for (const w of ISAN_WORDS) pool.set(w.word, { source: "isan", meaning: w.meaning });
  for (const w of opts.lyricWords ?? []) if (containsThai(w) && !pool.has(w)) pool.set(w, { source: "lyrics" });
  for (const c of opts.custom) {
    if (c.language === "en") continue;
    pool.set(c.word.trim(), { source: "custom", meaning: c.meaning || undefined });
  }
  pool.delete(target.word);

  const minScore = opts.minScore ?? 0.4;
  const results: RhymeResult[] = [];
  for (const [word, info] of pool) {
    const cand = analyzeThaiWordForRhyme(word, customByWord.get(word));
    if (!cand.last) continue;
    const comparison = compareRhymeUnits(target.last, cand.last);
    if (comparison.score < minScore) continue;
    const { matched } = compareMulti(target.units, cand.units);
    const score = comparison.score + 0.12 * Math.max(0, matched - 1);
    results.push({ word, source: info.source, meaning: info.meaning, syllables: cand.syllables, comparison, multi: matched, score });
  }
  results.sort((a, b) => b.score - a.score || a.word.length - b.word.length || a.word.localeCompare(b.word, "th"));
  return { target, results: results.slice(0, opts.limit ?? 200) };
}

export interface AlliterationResult {
  word: string;
  source: WordSource;
  meaning?: string;
  syllables: ThaiSyllable[];
  label: string;
  approximate: boolean;
}

/**
 * Words whose first syllable starts with the same initial *sound* as the query's
 * first syllable (สัมผัสอักษร), e.g. ใจ → จริง, จำ, จาก.
 */
export function findThaiAlliterations(query: string, opts: FindOptions): AlliterationResult[] {
  const q = query.trim();
  if (!q || !containsThai(q)) return [];
  const customByWord = new Map(opts.custom.map((c) => [c.word.trim(), c]));
  const target = analyzeThaiWordForRhyme(q, customByWord.get(q));
  const first = target.syllables[0];
  const sound = first ? thaiOnsetSound(first.onset) : null;
  if (!sound) return [];

  const pool = new Map<string, { source: WordSource; meaning?: string }>();
  for (const w of THAI_WORDS) if (!pool.has(w)) pool.set(w, { source: "built-in" });
  for (const w of ISAN_WORDS) pool.set(w.word, { source: "isan", meaning: w.meaning });
  for (const w of opts.lyricWords ?? []) if (containsThai(w) && !pool.has(w)) pool.set(w, { source: "lyrics" });
  for (const c of opts.custom) {
    if (c.language === "en") continue;
    pool.set(c.word.trim(), { source: "custom", meaning: c.meaning || undefined });
  }
  pool.delete(target.word);

  const out: AlliterationResult[] = [];
  for (const [word, info] of pool) {
    const cand = analyzeThaiWordForRhyme(word, customByWord.get(word));
    const s = cand.syllables[0];
    const o = s ? thaiOnsetSound(s.onset) : null;
    if (!o || o.key !== sound.key) continue;
    out.push({
      word, source: info.source, meaning: info.meaning, syllables: cand.syllables, label: o.label,
      approximate: o.approximate || sound.approximate || s.confidence < 0.7,
    });
  }
  out.sort((a, b) => a.syllables.length - b.syllables.length || a.word.localeCompare(b.word, "th"));
  return out.slice(0, opts.limit ?? 200);
}
