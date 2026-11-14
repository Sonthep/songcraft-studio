/**
 * English phonetics helpers.
 *
 * Pronunciations come from the CMU Pronouncing Dictionary via the server
 * route /api/phonetics (ARPAbet phones with stress digits). When a word is not
 * in the dictionary or the server is unreachable we fall back to a
 * spelling-based estimate that is clearly marked as such.
 */

export const ARPA_VOWELS = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW",
]);

export function stripStress(phone: string): string {
  return phone.replace(/[0-2]$/, "");
}

export function isVowelPhone(phone: string): boolean {
  return ARPA_VOWELS.has(stripStress(phone));
}

/** Rhyme tail: phones from the last stressed vowel (primary or secondary) to the end. */
export function rhymeTailFromPhones(phones: string[]): string[] {
  let idx = -1;
  for (let i = phones.length - 1; i >= 0; i--) {
    if (/[12]$/.test(phones[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    for (let i = phones.length - 1; i >= 0; i--) {
      if (isVowelPhone(phones[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return phones.map(stripStress);
  return phones.slice(idx).map(stripStress);
}

/** Split ARPAbet phones into syllable-sized chunks (one vowel each, onset maximal). */
export function phoneSyllables(phones: string[]): string[][] {
  const vowelIdx = phones.map((p, i) => (isVowelPhone(p) ? i : -1)).filter((i) => i >= 0);
  if (vowelIdx.length === 0) return [phones];
  const out: string[][] = [];
  let start = 0;
  for (let v = 0; v < vowelIdx.length; v++) {
    const vi = vowelIdx[v];
    const nextV = vowelIdx[v + 1];
    let end: number;
    if (nextV === undefined) end = phones.length;
    else {
      const consonants = nextV - vi - 1;
      // Give the following syllable one onset consonant when there are several.
      end = consonants <= 1 ? vi + 1 : nextV - 1;
    }
    out.push(phones.slice(start, end));
    start = end;
  }
  return out;
}

const SILENT_E = /[^aeiouy]e$/;

/** Spelling-based syllable estimate (fallback only). */
export function estimateEnglishSyllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let core = w;
  if (SILENT_E.test(core) && !/[^aeiouy]le$/.test(core)) core = core.slice(0, -1);
  core = core.replace(/(?:[^laeiouy]es|[^laeiouy]ed)$/, (m) => m[0]);
  const groups = core.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Split a word into approximately pronounceable chunks for display (fallback). */
export function splitEnglishWord(word: string, count?: number): string[] {
  const n = count ?? estimateEnglishSyllableCount(word);
  if (n <= 1) return [word];
  const lower = word.toLowerCase();
  const cuts: number[] = [];
  const isV = (c: string) => "aeiouy".includes(c);
  let i = 0;
  // Find vowel group ends and cut before the last consonant of each following cluster.
  while (i < lower.length && cuts.length < n - 1) {
    while (i < lower.length && !isV(lower[i])) i++;
    while (i < lower.length && isV(lower[i])) i++;
    let j = i;
    while (j < lower.length && !isV(lower[j])) j++;
    if (j >= lower.length) break;
    const consonants = j - i;
    const cut = consonants <= 1 ? i : j - 1;
    if (cut > 0 && cut < lower.length) cuts.push(cut);
    i = j;
  }
  const parts: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    parts.push(word.slice(prev, c));
    prev = c;
  }
  parts.push(word.slice(prev));
  return parts.filter(Boolean);
}

/** Spelling-based rhyme tail, e.g. "night" -> "ight", "love" -> "ove". */
export function orthographicRhymeTail(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const m = /[aeiouy]+[^aeiouy]*e?$/.exec(w);
  return m ? m[0] : w;
}

/** Map an ARPAbet vowel to an approximate Thai-style vowel/coda (for cross-language comparisons). */
export const ARPA_TO_THAI: Record<string, { vowel: string; long: boolean; glide?: "j" | "w" }> = {
  AA: { vowel: "a", long: true },
  AE: { vowel: "ɛ", long: true },
  AH: { vowel: "a", long: false },
  AO: { vowel: "ɔ", long: true },
  AW: { vowel: "a", long: false, glide: "w" },
  AY: { vowel: "a", long: false, glide: "j" },
  EH: { vowel: "e", long: false },
  ER: { vowel: "ɤ", long: true },
  EY: { vowel: "e", long: true, glide: "j" },
  IH: { vowel: "i", long: false },
  IY: { vowel: "i", long: true },
  OW: { vowel: "o", long: true, glide: "w" },
  OY: { vowel: "ɔ", long: true, glide: "j" },
  UH: { vowel: "u", long: false },
  UW: { vowel: "u", long: true },
};

export const ARPA_CODA_TO_THAI: Record<string, string> = {
  K: "k", G: "k",
  T: "t", D: "t", CH: "t", JH: "t", S: "t", Z: "t", SH: "t", ZH: "t", TH: "t", DH: "t", F: "p", V: "p",
  P: "p", B: "p",
  M: "m", N: "n", NG: "ng", L: "n", R: "",
};
