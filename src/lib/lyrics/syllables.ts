import type { LyricLine } from "@/lib/project/schema";
import { phoneSyllables, splitEnglishWord, estimateEnglishSyllableCount, isVowelPhone, stripStress } from "./english";
import { analyzeThaiSyllable, containsThai, segmentThaiWord, type ThaiSyllable } from "./thai";
import {
  englishRhymeUnitFromPhones,
  englishRhymeUnitFromSpelling,
  thaiRhymeUnit,
  type RhymeUnit,
} from "./rhyme";
import { applyCustomOverride, type CustomIndex } from "./custom-dictionary";
import { englishOnsetFromPhones, englishOnsetFromSpelling, thaiOnsetSound, type OnsetSound } from "./onset";

/** lowercase English word -> ARPAbet phones (null = not in dictionary). */
export type PronunciationMap = Record<string, string[] | null>;

export interface SyllableToken {
  /** Stable id: `${lineId}#${index}` — used to link melody notes to syllables. */
  id: string;
  lineId: string;
  index: number;
  text: string;
  lang: "th" | "en" | "other";
  word: string;
  wordIndex: number;
  wordStart: boolean;
  wordEnd: boolean;
  thai?: ThaiSyllable;
  stressed: boolean;
  /** Content word (not a function word / particle). */
  content: boolean;
  confidence: number;
  /** Rhyme of this syllable alone. */
  rhyme: RhymeUnit | null;
  /** On word-final tokens: the rhyme of the whole word ending (English tails can span syllables). */
  wordRhyme: RhymeUnit | null;
  /** True when the segmentation came from the user's manual override. */
  manual: boolean;
  /** Initial consonant sound, for alliteration (สัมผัสอักษร). Null for vowel-initial English syllables. */
  onset: OnsetSound | null;
}

export function syllableId(lineId: string, index: number): string {
  return `${lineId}#${index}`;
}

const EN_FUNCTION_WORDS = new Set(
  "a an the and or but if of to in on at by for with from as is am are was were be been it its i me my you your he him his she her we us our they them their this that these those so do does did not no yes oh yeah uh ooh ah la na".split(" "),
);

const TH_FUNCTION_WORDS = new Set([
  "ที่", "ของ", "และ", "ก็", "จะ", "ได้", "ให้", "ไป", "มา", "แล้ว", "กับ", "แต่", "หรือ", "ว่า", "เป็น", "อยู่", "คือ",
  "ใน", "นะ", "น่ะ", "ครับ", "ค่ะ", "คะ", "จ้ะ", "จ๋า", "เลย", "สิ", "ซิ", "เถอะ", "นั้น", "นี้", "นี่", "โน่น", "ยัง", "แค่",
  "บ่", "เด้อ", "เนาะ", "แหละ", "หรอก", "ล่ะ", "ไหม", "มั้ย", "เพราะ", "ถ้า", "เมื่อ", "จน", "ยัง",
]);

interface WordSeg {
  text: string;
  wordLike: boolean;
}

function segmentWords(text: string): WordSeg[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg("th", { granularity: "word" });
    return Array.from(seg.segment(text), (s) => ({ text: s.segment, wordLike: !!s.isWordLike }));
  }
  // Fallback: split on whitespace/punctuation; Thai runs stay as one "word" for the DP.
  return text
    .split(/(\s+|[.,!?;:"“”()\[\]…—–-]+)/)
    .filter(Boolean)
    .map((t) => ({ text: t, wordLike: /[\p{L}\p{N}]/u.test(t) }));
}

function englishTokens(word: string, pron: PronunciationMap | undefined) {
  const key = word.toLowerCase().replace(/[^a-z']/g, "");
  const phones = pron?.[key] ?? null;
  if (phones && phones.length) {
    const chunks = phoneSyllables(phones);
    const parts = splitEnglishWord(word, chunks.length);
    // If spelling split disagrees with phone count, align by padding/merging.
    const texts = alignParts(parts, chunks.length, word);
    return chunks.map((chunk, i) => ({
      text: texts[i],
      stressed: chunk.some((p) => /1$/.test(p)) || (chunks.length === 1 && !EN_FUNCTION_WORDS.has(key)),
      rhyme: syllableUnitFromChunk(chunk),
      onset: englishOnsetFromPhones(chunk),
      confidence: 0.95,
    }));
  }
  const count = estimateEnglishSyllableCount(word);
  const parts = alignParts(splitEnglishWord(word, count), Math.max(1, count), word);
  return parts.map((text, i) => ({
    text,
    stressed: parts.length === 1 ? !EN_FUNCTION_WORDS.has(key) : i === 0,
    rhyme: englishRhymeUnitFromSpelling(text),
    onset: i === 0 ? englishOnsetFromSpelling(word) : null,
    confidence: 0.4,
  }));
}

function alignParts(parts: string[], n: number, word: string): string[] {
  if (parts.length === n) return parts;
  if (n <= 1) return [word];
  if (parts.length > n) {
    const merged = parts.slice(0, n - 1);
    merged.push(parts.slice(n - 1).join(""));
    return merged;
  }
  // Fewer spelling parts than phonetic syllables: split the longest part evenly.
  const out = [...parts];
  while (out.length < n) {
    let longest = 0;
    out.forEach((p, i) => {
      if (p.length > out[longest].length) longest = i;
    });
    const p = out[longest];
    if (p.length < 2) {
      out.push("");
      continue;
    }
    const mid = Math.ceil(p.length / 2);
    out.splice(longest, 1, p.slice(0, mid), p.slice(mid));
  }
  return out;
}

function syllableUnitFromChunk(chunk: string[]): RhymeUnit {
  const vIdx = chunk.findIndex((p) => isVowelPhone(p));
  const tail = vIdx >= 0 ? chunk.slice(vIdx) : chunk;
  // Reuse the word-tail mapper on a single syllable; force stress so the tail starts at its vowel.
  const forced = tail.map((p, i) => (i === 0 && isVowelPhone(p) ? `${stripStress(p)}1` : p));
  return englishRhymeUnitFromPhones(forced);
}

/**
 * Split one lyric line into syllable tokens with phonetic information.
 * Honors the user's manual syllable override when present.
 */
export function segmentLine(line: LyricLine, pron?: PronunciationMap, custom?: CustomIndex): SyllableToken[] {
  const tokens: SyllableToken[] = [];
  const push = (t: Omit<SyllableToken, "id" | "lineId" | "index">) => {
    const index = tokens.length;
    tokens.push({ ...t, id: syllableId(line.id, index), lineId: line.id, index });
  };

  if (line.syllableOverride && line.syllableOverride.length > 0) {
    line.syllableOverride.forEach((raw, wi) => {
      const text = raw.trim();
      if (!text) return;
      if (containsThai(text)) {
        const thai = analyzeThaiSyllable(text);
        const unit = applyCustomOverride(thaiRhymeUnit(thai), custom?.byWord.get(text.toLowerCase()));
        push({
          text, lang: "th", word: text, wordIndex: wi, wordStart: true, wordEnd: true, thai,
          stressed: true, content: !TH_FUNCTION_WORDS.has(text), confidence: 1, rhyme: unit, wordRhyme: unit, manual: true,
          onset: thaiOnsetSound(thai.onset),
        });
      } else {
        const key = text.toLowerCase().replace(/[^a-z']/g, "");
        const phones = pron?.[key] ?? null;
        const unit = applyCustomOverride(
          phones ? englishRhymeUnitFromPhones(phones) : /[a-z]/i.test(text) ? englishRhymeUnitFromSpelling(text) : null,
          custom?.byWord.get(key),
        );
        push({
          text, lang: /[a-z]/i.test(text) ? "en" : "other", word: text, wordIndex: wi, wordStart: true, wordEnd: true,
          stressed: true, content: !EN_FUNCTION_WORDS.has(key), confidence: 1, rhyme: unit, wordRhyme: unit, manual: true,
          onset: phones ? englishOnsetFromPhones(phones) : englishOnsetFromSpelling(text),
        });
      }
    });
    return tokens;
  }

  const segs = segmentWords(line.text);
  let wordIndex = 0;
  let prevThaiWord: ThaiSyllable[] | null = null;
  let prevWordText = "";
  for (const seg of segs) {
    const text = seg.text;
    if (text.includes("ๆ") && prevThaiWord) {
      // Repetition mark: repeat the previous word.
      const repeated = prevThaiWord;
      repeated.forEach((s, i) => {
        push({
          text: s.text, lang: "th", word: prevWordText, wordIndex, wordStart: i === 0, wordEnd: i === repeated.length - 1,
          thai: s, stressed: i === repeated.length - 1, content: !TH_FUNCTION_WORDS.has(prevWordText),
          confidence: s.confidence, rhyme: thaiRhymeUnit(s), wordRhyme: i === repeated.length - 1 ? thaiRhymeUnit(s) : null,
          manual: false, onset: thaiOnsetSound(s.onset),
        });
      });
      wordIndex++;
      continue;
    }
    if (!seg.wordLike) continue;
    if (containsThai(text)) {
      const clean = text.replace(/[^฀-๿]/g, "");
      if (!clean) continue;
      // ๆ (mai yamok) repeats the preceding word; the segmenter often keeps it attached (ช้าๆ).
      const repeats = (clean.match(/ๆ/g) ?? []).length;
      const base = clean.replace(/ๆ/g, "");
      if (!base) continue;
      const once = segmentThaiWord(base);
      const sylls = Array.from({ length: repeats + 1 }, () => once).flat();
      const entry = custom?.byWord.get(clean.toLowerCase());
      let custSylls: ThaiSyllable[] = sylls;
      if (entry?.syllables) {
        const parts = entry.syllables.split(/[-·|\s]+/).filter(Boolean);
        if (parts.length) custSylls = parts.map((p) => analyzeThaiSyllable(p));
      }
      custSylls.forEach((s, i) => {
        const last = i === custSylls.length - 1;
        const unit = thaiRhymeUnit(s);
        const finalUnit = last ? applyCustomOverride(unit, entry) : unit;
        push({
          text: s.text, lang: "th", word: clean, wordIndex, wordStart: i === 0, wordEnd: last, thai: s,
          stressed: last && s.rule !== "hidden a (bare consonant)",
          content: !TH_FUNCTION_WORDS.has(clean),
          confidence: entry?.syllables ? 1 : s.confidence,
          rhyme: finalUnit, wordRhyme: last ? finalUnit : null, manual: false, onset: thaiOnsetSound(s.onset),
        });
      });
      prevThaiWord = custSylls;
      prevWordText = clean;
      wordIndex++;
    } else if (/[a-z]/i.test(text)) {
      const key = text.toLowerCase().replace(/[^a-z']/g, "");
      const parts = englishTokens(text, pron);
      const phones = pron?.[key] ?? null;
      const entry = custom?.byWord.get(key);
      const wordUnit = applyCustomOverride(
        phones ? englishRhymeUnitFromPhones(phones) : englishRhymeUnitFromSpelling(text),
        entry,
      );
      parts.forEach((p, i) => {
        const last = i === parts.length - 1;
        push({
          text: p.text, lang: "en", word: text, wordIndex, wordStart: i === 0, wordEnd: last,
          stressed: p.stressed, content: !EN_FUNCTION_WORDS.has(key), confidence: p.confidence,
          rhyme: last ? wordUnit : p.rhyme, wordRhyme: last ? wordUnit : null, manual: false, onset: p.onset,
        });
      });
      prevThaiWord = null;
      wordIndex++;
    } else if (/\p{N}/u.test(text)) {
      push({
        text, lang: "other", word: text, wordIndex, wordStart: true, wordEnd: true, stressed: true, content: true,
        confidence: 0.3, rhyme: null, wordRhyme: null, manual: false, onset: null,
      });
      prevThaiWord = null;
      wordIndex++;
    }
  }
  return tokens;
}

/** Format tokens as an editable override string: syllables separated by "-" within words and spaces between words. */
export function tokensToOverrideText(tokens: SyllableToken[]): string {
  let out = "";
  tokens.forEach((t, i) => {
    if (i > 0) out += t.wordStart ? " " : "-";
    out += t.text;
  });
  return out;
}

export function parseOverrideText(text: string): string[] | null {
  const parts = text.split(/[-\s·|]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

/** Collect unique English words in some text (for pronunciation lookup). */
export function englishWordsIn(texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/[A-Za-z][A-Za-z']*/g)) set.add(m[0].toLowerCase().replace(/[^a-z']/g, ""));
  }
  return [...set].filter(Boolean);
}
