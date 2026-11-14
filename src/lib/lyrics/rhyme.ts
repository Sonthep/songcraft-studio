import { ARPA_CODA_TO_THAI, ARPA_TO_THAI, isVowelPhone, orthographicRhymeTail, rhymeTailFromPhones, stripStress } from "./english";
import { thaiRhymeLabel, type ThaiSyllable } from "./thai";

/**
 * A comparable rhyme description for one syllable (Thai) or a word tail (English).
 * Thai units are phonological (vowel + length + final sound). English units carry
 * the exact ARPAbet tail when the CMU dictionary knows the word.
 */
export interface RhymeUnit {
  lang: "th" | "en";
  /** Vowel quality in a shared Thai-style inventory (approximate for English). */
  vowel: string;
  long: boolean;
  /** Final sound in the Thai-style coda inventory ("", k, t, p, m, n, ng, j, w). */
  coda: string;
  /** Exact English tail phones (no stress digits) when available. */
  enTail?: string[];
  source: "thai-rules" | "cmu" | "spelling" | "custom";
  confidence: number;
  label: string;
  /** User-defined rhyme group from the custom dictionary. */
  customGroup?: string;
}

export type RhymeKind = "exact" | "near" | "assonance" | "consonance" | "custom" | "none";

export interface RhymeComparison {
  score: number; // 0..1
  kind: RhymeKind;
  reasons: string[];
  /** True if either side is an estimate (hidden vowel, spelling-based, cross-language). */
  uncertain: boolean;
}

const CODA_CLASS: Record<string, string> = {
  "": "open",
  m: "nasal",
  n: "nasal",
  ng: "nasal",
  k: "stop",
  t: "stop",
  p: "stop",
  j: "glide",
  w: "glide",
};

function codaName(c: string): string {
  return c === "" ? "no final consonant" : c === "ng" ? "/ŋ/" : `/${c}/`;
}

export function thaiRhymeUnit(s: ThaiSyllable): RhymeUnit {
  return {
    lang: "th",
    vowel: s.vowel,
    long: s.long,
    coda: s.coda,
    source: "thai-rules",
    confidence: s.confidence,
    label: thaiRhymeLabel(s),
  };
}

export function englishRhymeUnitFromPhones(phones: string[]): RhymeUnit {
  const tail = rhymeTailFromPhones(phones);
  const v = tail.find((p) => isVowelPhone(p)) ?? "AH";
  const map = ARPA_TO_THAI[stripStress(v)] ?? { vowel: "a", long: false };
  const after = tail.slice(tail.indexOf(v) + 1).filter((p) => !isVowelPhone(p));
  let coda = "";
  const lastConsonant = after.filter((p) => p !== "R").slice(-1)[0];
  if (lastConsonant) coda = ARPA_CODA_TO_THAI[lastConsonant] ?? "";
  else if (map.glide) coda = map.glide;
  return {
    lang: "en",
    vowel: map.vowel,
    long: map.long,
    coda,
    enTail: tail,
    source: "cmu",
    confidence: 0.95,
    label: tail.join(" "),
  };
}

export function englishRhymeUnitFromSpelling(word: string): RhymeUnit {
  const tail = orthographicRhymeTail(word);
  return {
    lang: "en",
    vowel: tail.replace(/[^aeiouy].*$/, "") || tail,
    long: false,
    coda: "",
    source: "spelling",
    confidence: 0.35,
    label: `-${tail} (spelling)`,
  };
}

/** Grouping key: equal keys are treated as exact rhymes within one language. */
export function rhymeKey(u: RhymeUnit): string {
  if (u.customGroup) return `custom:${u.customGroup}`;
  if (u.lang === "en") {
    if (u.enTail) return `en:${u.enTail.join(" ")}`;
    return `en~${u.label}`;
  }
  return `th:${u.vowel}${u.long ? "ː" : ""}|${u.coda}`;
}

const VOWEL_SIMILAR: Array<[string, string]> = [
  ["e", "ɛ"],
  ["o", "ɔ"],
  ["ɤ", "ɯ"],
  ["i", "e"],
  ["u", "o"],
];

function vowelsSimilar(a: string, b: string): boolean {
  return VOWEL_SIMILAR.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function compareRhymeUnits(a: RhymeUnit, b: RhymeUnit): RhymeComparison {
  const reasons: string[] = [];
  const uncertain =
    a.confidence < 0.7 || b.confidence < 0.7 || a.source === "spelling" || b.source === "spelling" || a.lang !== b.lang;

  if (a.customGroup && a.customGroup === b.customGroup) {
    return { score: 1, kind: "custom", reasons: [`Both are in your custom rhyme group "${a.customGroup}".`], uncertain: false };
  }

  // English vs English with exact dictionary tails.
  if (a.lang === "en" && b.lang === "en") {
    if (a.enTail && b.enTail) {
      const ta = a.enTail.join(" ");
      const tb = b.enTail.join(" ");
      if (ta === tb) {
        return { score: 1, kind: "exact", reasons: [`Same stressed vowel and ending sounds (${ta}).`], uncertain: false };
      }
      const va = a.enTail[0];
      const vb = b.enTail[0];
      const ca = a.enTail.slice(1).join(" ");
      const cb = b.enTail.slice(1).join(" ");
      if (va === vb) {
        if (CODA_CLASS[a.coda] === CODA_CLASS[b.coda]) {
          return {
            score: 0.7,
            kind: "near",
            reasons: [`Same stressed vowel ${va}; endings differ but are similar (${ca || "—"} vs ${cb || "—"}).`],
            uncertain: false,
          };
        }
        return { score: 0.5, kind: "assonance", reasons: [`Same stressed vowel ${va} (assonance).`], uncertain: false };
      }
      if (ca && ca === cb) {
        return { score: 0.3, kind: "consonance", reasons: [`Same ending consonants (${ca}) with different vowels.`], uncertain: false };
      }
      return { score: 0, kind: "none", reasons: [], uncertain: false };
    }
    // Spelling fallback.
    if (a.label === b.label) {
      return { score: 0.6, kind: "near", reasons: ["Same spelling ending (pronunciation not verified)."], uncertain: true };
    }
    return { score: 0, kind: "none", reasons: [], uncertain: true };
  }

  const sameVowel = a.vowel === b.vowel;
  const sameLength = a.long === b.long;
  const sameCoda = a.coda === b.coda;
  const sameCodaClass = CODA_CLASS[a.coda] === CODA_CLASS[b.coda];
  const cross = a.lang !== b.lang;
  const cap = cross ? 0.6 : 1;
  if (cross) reasons.push("Cross-language comparison uses an approximate vowel mapping.");

  let score = 0;
  let kind: RhymeKind = "none";
  if (sameVowel && sameLength && sameCoda) {
    score = 1;
    kind = "exact";
    reasons.unshift(`Same vowel ${vowelText(a)} and same final sound ${codaName(a.coda)}.`);
  } else if (sameVowel && !sameLength && sameCoda) {
    score = 0.75;
    kind = "near";
    reasons.unshift(`Same vowel quality and final ${codaName(a.coda)}, but vowel length differs (${vowelText(a)} vs ${vowelText(b)}).`);
  } else if (sameVowel && sameLength && sameCodaClass) {
    score = 0.65;
    kind = "near";
    reasons.unshift(`Same vowel ${vowelText(a)}; finals ${codaName(a.coda)} and ${codaName(b.coda)} are both ${CODA_CLASS[a.coda]} sounds.`);
  } else if (sameVowel) {
    score = 0.45;
    kind = "assonance";
    reasons.unshift(`Same vowel ${a.vowel} but different finals (${codaName(a.coda)} vs ${codaName(b.coda)}).`);
  } else if (vowelsSimilar(a.vowel, b.vowel) && sameCoda && a.coda !== "") {
    score = 0.4;
    kind = "near";
    reasons.unshift(`Similar vowels (${a.vowel} / ${b.vowel}) with the same final ${codaName(a.coda)}.`);
  } else if (sameCoda && a.coda !== "") {
    score = 0.25;
    kind = "consonance";
    reasons.unshift(`Same final sound ${codaName(a.coda)} with different vowels.`);
  }
  if (cross && kind === "exact") kind = "near";
  score = Math.min(score, cap);
  if (score > 0 && (a.confidence < 0.7 || b.confidence < 0.7)) {
    reasons.push("One of the readings is an estimate (hidden vowel or irregular spelling) — check pronunciation.");
  }
  return { score, kind, reasons, uncertain };
}

function vowelText(u: RhymeUnit): string {
  if (u.lang === "en" && u.enTail) return u.enTail[0];
  if (["ia", "ɯa", "ua"].includes(u.vowel)) return u.long ? u.vowel : `${u.vowel} (short)`;
  return u.long ? `${u.vowel}${u.vowel}` : u.vowel;
}

/** Compare the last N units of two words (multisyllabic rhyme detection). */
export function compareMulti(a: RhymeUnit[], b: RhymeUnit[]): { matched: number; scores: number[] } {
  const scores: number[] = [];
  let matched = 0;
  for (let i = 1; i <= Math.min(a.length, b.length); i++) {
    const c = compareRhymeUnits(a[a.length - i], b[b.length - i]);
    scores.push(c.score);
    if (c.score >= 0.6) matched++;
    else break;
  }
  return { matched, scores };
}
