/**
 * Rule-based Thai orthographic syllable parser and phonology estimator.
 *
 * Thai script does not mark word or syllable boundaries with spaces, and some
 * vowels are not written (e.g. the hidden "o" in คน, the hidden "a" in สบาย).
 * This module enumerates plausible syllable readings at every position and
 * picks the best-scoring segmentation with dynamic programming. Each syllable
 * carries the rule that produced it and a confidence value so that the UI can
 * flag uncertain readings and the user can override them.
 *
 * Rhyme in Thai poetry (สัมผัส) is based on vowel quality + vowel length +
 * final consonant *sound* (not spelling): น ณ ญ ร ล ฬ all end in /n/, and
 * ด ต จ ช ซ ศ ษ ส ท ธ ... all end in /t/. That is why rhyme keys here are
 * derived from phonology instead of string suffixes.
 *
 * Limitations: loanwords, irregular spellings, linking syllables (ผลไม้ =
 * phon-la-maai) and Isan pronunciations are not fully covered.
 */

export type ThaiTone = "mid" | "low" | "falling" | "high" | "rising";
export type ConsonantClass = "mid" | "high" | "low";
export type Coda = "" | "k" | "t" | "p" | "m" | "n" | "ng" | "j" | "w";
export type VowelQuality = "a" | "i" | "ɯ" | "u" | "e" | "ɛ" | "o" | "ɔ" | "ɤ" | "ia" | "ɯa" | "ua";

export interface ThaiSyllable {
  text: string;
  /** Initial consonant letters as written (cluster or compound). */
  onset: string;
  onsetClass: ConsonantClass;
  vowel: VowelQuality;
  long: boolean;
  coda: Coda;
  tone: ThaiTone;
  /** Live (คำเป็น) vs dead (คำตาย) syllable. */
  live: boolean;
  /** 0..1, lower for hidden-vowel readings. */
  confidence: number;
  /** Human-readable name of the spelling pattern used. */
  rule: string;
  /** Written tone mark, if any. */
  toneMark: string | null;
}

const CONSONANTS = "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
const MID_CLASS = "กจฎฏดตบปอ";
const HIGH_CLASS = "ขฃฉฐถผฝศษสห";
const LEADING_VOWELS = "เแโใไ";
const ABOVE_BELOW = "ัิีึืุู็";
const TONE_MARKS = "่้๊๋";
const KARAN = "์";
const FOLLOWING = "ะาำๅ";
/** Characters that must attach to a preceding consonant. */
const COMBINING = ABOVE_BELOW + TONE_MARKS + KARAN + FOLLOWING;

const FINAL_SOUND: Record<string, Coda> = {};
for (const c of "กขฃคฅฆ") FINAL_SOUND[c] = "k";
for (const c of "จชซฌฎฏฐฑฒดตถทธศษส") FINAL_SOUND[c] = "t";
for (const c of "บปพฟภ") FINAL_SOUND[c] = "p";
for (const c of "ญณนรลฬ") FINAL_SOUND[c] = "n";
FINAL_SOUND["ม"] = "m";
FINAL_SOUND["ง"] = "ng";
FINAL_SOUND["ย"] = "j";
FINAL_SOUND["ว"] = "w";

const CLUSTERS = new Set([
  "กร", "กล", "กว", "ขร", "ขล", "ขว", "คร", "คล", "คว",
  "ตร", "ปร", "ปล", "พร", "พล", "ผล", "บร", "บล", "ฟร", "ฟล",
]);
const SONORANTS = "งญนมยรลว";

export function isThaiChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0x0e00 && c <= 0x0e7f;
}

export function containsThai(s: string): boolean {
  for (const ch of s) if (isThaiChar(ch)) return true;
  return false;
}

/** Safe single-character membership test ("abc".includes("") is always true). */
function inSet(set: string, ch: string | undefined): boolean {
  return !!ch && ch.length === 1 && set.includes(ch);
}

function isConsonant(ch: string | undefined): boolean {
  return inSet(CONSONANTS, ch);
}

function classOf(ch: string): ConsonantClass {
  if (MID_CLASS.includes(ch)) return "mid";
  if (HIGH_CLASS.includes(ch)) return "high";
  return "low";
}

const STOP_CODAS: Coda[] = ["k", "t", "p"];

export function computeTone(cls: ConsonantClass, live: boolean, long: boolean, mark: string | null): ThaiTone {
  switch (mark) {
    case "่":
      return cls === "low" ? "falling" : "low";
    case "้":
      return cls === "low" ? "high" : "falling";
    case "๊":
      return "high";
    case "๋":
      return "rising";
  }
  if (live) return cls === "high" ? "rising" : "mid";
  if (cls === "low") return long ? "falling" : "high";
  return "low";
}

interface Onset {
  end: number;
  text: string;
  cls: ConsonantClass;
  cluster: boolean;
}

function onsetsAt(s: string, i: number): Onset[] {
  const out: Onset[] = [];
  const c1 = s[i];
  if (!isConsonant(c1)) return out;
  out.push({ end: i + 1, text: c1, cls: classOf(c1), cluster: false });
  const c2 = s[i + 1];
  if (!isConsonant(c2)) return out;
  const pair = c1 + c2;
  if (CLUSTERS.has(pair)) out.push({ end: i + 2, text: pair, cls: classOf(c1), cluster: true });
  if (c1 === "ห" && SONORANTS.includes(c2)) out.push({ end: i + 2, text: pair, cls: "high", cluster: true });
  if (pair === "อย") out.push({ end: i + 2, text: pair, cls: "mid", cluster: true });
  if (pair === "ทร" || pair === "ซร") out.push({ end: i + 2, text: pair, cls: "low", cluster: true });
  if (pair === "สร" || pair === "ศร") out.push({ end: i + 2, text: pair, cls: "high", cluster: true });
  if (pair === "จร") out.push({ end: i + 2, text: pair, cls: "mid", cluster: true });
  return out;
}

/** Can s[k] serve as a final consonant (not the start of the next syllable)? */
function isFinalAt(s: string, k: number): boolean {
  const ch = s[k];
  if (!ch || !(ch in FINAL_SOUND)) return false;
  const next = s[k + 1];
  if (next === KARAN) return false; // silenced
  if (ch === "ร" && next === "ร") return false; // -รร- is a vowel spelling (กรรม, สวรรค์)
  if (inSet(COMBINING, next)) return false; // it carries a vowel/tone: next syllable's onset
  return true;
}

/** Skip silent letters marked with karan (์), e.g. จันทร์, กาพย์, ศักดิ์. */
function absorbSilent(s: string, k: number): number {
  for (;;) {
    if (isConsonant(s[k]) && s[k + 1] === KARAN) {
      k += 2;
      continue;
    }
    // Two silent letters only for C+ร+์ (จันทร์, ศาสตร์); otherwise อาวรณ์ would lose its /ɔɔn/.
    if (isConsonant(s[k]) && s[k + 1] === "ร" && s[k + 2] === KARAN) {
      k += 3;
      continue;
    }
    if (isConsonant(s[k]) && (s[k + 1] === "ิ" || s[k + 1] === "ุ") && s[k + 2] === KARAN) {
      k += 3;
      continue;
    }
    if (s[k] === KARAN) {
      k += 1;
      continue;
    }
    return k;
  }
}

interface Candidate {
  end: number;
  syl: ThaiSyllable;
  score: number;
}

interface Build {
  onset: Onset;
  vowel: VowelQuality;
  long: boolean;
  coda: Coda;
  mark: string | null;
  confidence: number;
  rule: string;
  score: number;
}

function finalize(s: string, start: number, end: number, b: Build): Candidate {
  const realEnd = absorbSilent(s, end);
  const live = b.coda === "" ? b.long : !STOP_CODAS.includes(b.coda);
  const tone = computeTone(b.onset.cls, live, b.long, b.mark);
  return {
    end: realEnd,
    score: b.score,
    syl: {
      text: s.slice(start, realEnd),
      onset: b.onset.text,
      onsetClass: b.onset.cls,
      vowel: b.vowel,
      long: b.long,
      coda: b.coda,
      tone,
      live,
      confidence: b.confidence,
      rule: b.rule,
      toneMark: b.mark,
    },
  };
}

function candidatesAt(s: string, i: number, wordEnd: number): Candidate[] {
  const out: Candidate[] = [];
  const ch = s[i];

  // ฤ / ฦ behave as an onset+vowel unit (rɯ / lɯ).
  if (ch === "ฤ" || ch === "ฦ") {
    const onset: Onset = { end: i + 1, text: ch, cls: "low", cluster: false };
    let end = i + 1;
    if (s[end] === "ๅ") end++;
    out.push(
      finalize(s, i, end, {
        onset, vowel: "ɯ", long: s[i + 1] === "ๅ", coda: "", mark: null,
        confidence: 0.7, rule: "ฤ/ฦ vowel letter", score: 8,
      }),
    );
    return out;
  }

  let p = i;
  let lead: string | null = null;
  if (inSet(LEADING_VOWELS, s[p])) {
    lead = s[p];
    p++;
  }

  for (const onset of onsetsAt(s, p)) {
    let q = onset.end;
    let v1: string | null = null;
    if (inSet(ABOVE_BELOW, s[q])) {
      v1 = s[q];
      q++;
    }
    let mark: string | null = null;
    if (inSet(TONE_MARKS, s[q])) {
      mark = s[q];
      q++;
    }
    const at = (k: number) => s[k] ?? "";
    const push = (end: number, vowel: VowelQuality, long: boolean, coda: Coda, rule: string, confidence = 0.95, score = 10) => {
      out.push(finalize(s, i, end, { onset, vowel, long, coda, mark, confidence, rule, score }));
    };
    /** Push the open form and, if a final consonant follows, the closed form. */
    const pushOptFinal = (end: number, vowel: VowelQuality, long: boolean, rule: string, confidence = 0.95) => {
      if (isFinalAt(s, end)) push(end + 1, vowel, long, FINAL_SOUND[at(end)], `${rule} + final`, confidence);
      push(end, vowel, long, "", rule, confidence);
    };

    if (lead === null) {
      if (v1 === null) {
        if (at(q) === "ะ") push(q + 1, "a", false, "", "-ะ");
        else if (at(q) === "า") pushOptFinal(q + 1, "a", true, "-า");
        else if (at(q) === "ำ") push(q + 1, "a", false, "m", "-ำ");
        else if (at(q) === "อ" && !inSet(COMBINING, at(q + 1))) pushOptFinal(q + 1, "ɔ", true, "-อ");
        else if (at(q) === "ว" && isFinalAt(s, q + 1)) push(q + 2, "ua", true, FINAL_SOUND[at(q + 1)], "-ว- (ua)");
        else if (at(q) === "ร" && at(q + 1) === "ร") {
          if (isFinalAt(s, q + 2)) push(q + 3, "a", false, FINAL_SOUND[at(q + 2)], "-รร- (a)", 0.85);
          else push(q + 2, "a", false, "n", "-รร (an)", 0.85);
        }
        if (at(q) === "ร" && at(q + 1) !== "ร" && !inSet(COMBINING, at(q + 1)) && !onset.cluster) {
          // e.g. พร, อุดร, อาวรณ์: written C+ร with no vowel reads /ɔɔn/.
          push(q + 1, "ɔ", true, "n", "C+ร (ɔɔn)", 0.75, 6);
        }
        if (isFinalAt(s, q) && at(q) !== "อ") {
          // Hidden short "o": คน, ผล, รส, กรม.
          const coda = FINAL_SOUND[at(q)];
          const glide = coda === "j" || coda === "w";
          push(q + 1, "o", false, coda, "hidden o + final", glide ? 0.4 : 0.7, glide ? 2 : onset.cluster ? 5 : 4);
        }
        if (mark === null && !onset.cluster) {
          // Bare consonant with a hidden short "a": สบาย -> สะ-บาย, ขนม -> ขะ-หนม.
          const atWordEnd = q >= wordEnd;
          push(q, "a", false, "", "hidden a (bare consonant)", 0.5, atWordEnd ? 0 : 1);
        }
        if (mark !== null && !isFinalAt(s, q) && !["ะ", "า", "ำ", "อ", "ว", "ร"].includes(at(q))) {
          // Consonant + tone mark alone: e.g. ก่ (rare); treat as hidden "o" open with low confidence.
          push(q, "o", false, "", "consonant + tone mark", 0.3, 1);
        }
      } else if (v1 === "ั") {
        if (at(q) === "ว") {
          if (isFinalAt(s, q + 1) && at(q + 1) !== "ว") push(q + 2, "ua", true, FINAL_SOUND[at(q + 1)], "-ัว + final", 0.8);
          push(q + 1, "ua", true, "", "-ัว");
        }
        if (isFinalAt(s, q)) push(q + 1, "a", false, FINAL_SOUND[at(q)], "-ั- + final");
      } else if (v1 === "็") {
        if (onset.text === "ก" && mark === null) push(q, "ɔ", false, "", "ก็");
        else if (isFinalAt(s, q)) push(q + 1, "o", false, FINAL_SOUND[at(q)], "-็- + final", 0.6);
      } else {
        const map: Record<string, [VowelQuality, boolean]> = {
          "ิ": ["i", false],
          "ี": ["i", true],
          "ึ": ["ɯ", false],
          "ื": ["ɯ", true],
          "ุ": ["u", false],
          "ู": ["u", true],
        };
        const [vq, long] = map[v1];
        if (v1 === "ื" && at(q) === "อ") pushOptFinal(q + 1, "ɯ", true, "-ือ");
        else pushOptFinal(q, vq, long, `-${v1}`);
      }
    } else if (lead === "เ") {
      if (v1 === null) {
        if (at(q) === "า" && at(q + 1) === "ะ") push(q + 2, "ɔ", false, "", "เ-าะ");
        else if (at(q) === "า") push(q + 1, "a", false, "w", "เ-า");
        else if (at(q) === "อ" && at(q + 1) === "ะ") push(q + 2, "ɤ", false, "", "เ-อะ");
        else if (at(q) === "อ") push(q + 1, "ɤ", true, "", "เ-อ");
        else if (at(q) === "ะ") push(q + 1, "e", false, "", "เ-ะ");
        else if (at(q) === "ย" && !inSet(COMBINING, at(q + 1))) push(q + 1, "ɤ", true, "j", "เ-ย");
        else {
          if (isFinalAt(s, q)) push(q + 1, "e", true, FINAL_SOUND[at(q)], "เ- + final", 0.85);
          push(q, "e", true, "", "เ-");
        }
      } else if (v1 === "็") {
        if (isFinalAt(s, q)) push(q + 1, "e", false, FINAL_SOUND[at(q)], "เ-็ + final");
      } else if (v1 === "ิ") {
        if (isFinalAt(s, q)) push(q + 1, "ɤ", true, FINAL_SOUND[at(q)], "เ-ิ + final");
      } else if (v1 === "ี" && at(q) === "ย") {
        if (at(q + 1) === "ะ") push(q + 2, "ia", false, "", "เ-ียะ");
        else pushOptFinal(q + 1, "ia", true, "เ-ีย");
      } else if (v1 === "ื" && at(q) === "อ") {
        if (at(q + 1) === "ะ") push(q + 2, "ɯa", false, "", "เ-ือะ");
        else pushOptFinal(q + 1, "ɯa", true, "เ-ือ");
      }
    } else if (lead === "แ") {
      if (v1 === null) {
        if (at(q) === "ะ") push(q + 1, "ɛ", false, "", "แ-ะ");
        else {
          if (isFinalAt(s, q)) push(q + 1, "ɛ", true, FINAL_SOUND[at(q)], "แ- + final");
          push(q, "ɛ", true, "", "แ-");
        }
      } else if (v1 === "็" && isFinalAt(s, q)) push(q + 1, "ɛ", false, FINAL_SOUND[at(q)], "แ-็ + final");
    } else if (lead === "โ") {
      if (v1 === null) {
        if (at(q) === "ะ") push(q + 1, "o", false, "", "โ-ะ");
        else {
          if (isFinalAt(s, q)) push(q + 1, "o", true, FINAL_SOUND[at(q)], "โ- + final");
          push(q, "o", true, "", "โ-");
        }
      }
    } else if (lead === "ใ" || lead === "ไ") {
      if (v1 === null) {
        if (at(q) === "ย" && !inSet(COMBINING, at(q + 1))) push(q + 1, "a", false, "j", `${lead}-ย`);
        push(q, "a", false, "j", `${lead}-`);
      }
    }
  }
  return out;
}

/**
 * Per-syllable cost. It must exceed the score of a single explicit reading so
 * that one well-formed syllable (เพลง) beats two (เพ + ลง).
 */
const SYLLABLE_COST = 12;

/** Segment a run of Thai letters (one word) into syllables using DP. */
export function segmentThaiWord(word: string): ThaiSyllable[] {
  const s = word;
  const n = s.length;
  const best: Array<{ score: number; prev: number; syl: ThaiSyllable | null } | null> = new Array(n + 1).fill(null);
  best[0] = { score: 0, prev: -1, syl: null };
  for (let i = 0; i < n; i++) {
    const here = best[i];
    if (!here) continue;
    const cands = candidatesAt(s, i, n);
    for (const c of cands) {
      if (c.end <= i || c.end > n) continue;
      const score = here.score + c.score - SYLLABLE_COST;
      const cur = best[c.end];
      if (!cur || score > cur.score) best[c.end] = { score, prev: i, syl: c.syl };
    }
    // Fallback: skip an unparseable character (heavily penalised) so we never get stuck.
    const skipScore = here.score - 40;
    const next = best[i + 1];
    if (!next || skipScore > next.score) best[i + 1] = { score: skipScore, prev: i, syl: null };
  }
  const out: ThaiSyllable[] = [];
  let k = n;
  // Walk back; if the end is unreachable, return a single low-confidence chunk.
  if (!best[n]) {
    return [unknownSyllable(word)];
  }
  const parts: Array<{ start: number; end: number; syl: ThaiSyllable | null }> = [];
  while (k > 0) {
    const b = best[k]!;
    parts.push({ start: b.prev, end: k, syl: b.syl });
    k = b.prev;
  }
  parts.reverse();
  for (const part of parts) {
    if (part.syl) out.push(part.syl);
    else if (out.length > 0) {
      // Attach a skipped character to the previous syllable's text.
      const last = out[out.length - 1];
      out[out.length - 1] = { ...last, text: last.text + s.slice(part.start, part.end), confidence: Math.min(last.confidence, 0.4) };
    } else if (s.slice(part.start, part.end).trim()) {
      out.push(unknownSyllable(s.slice(part.start, part.end)));
    }
  }
  return applyLeadingConsonants(out);
}

/**
 * อักษรนำ: a bare high/mid-class consonant (hidden "a") followed by a syllable
 * whose onset is a single low-class sonorant lends its class to that syllable,
 * e.g. ขนม -> ขะ-หนม (nǒm), ตลาด -> ตะ-หลาด (làat).
 */
function applyLeadingConsonants(sylls: ThaiSyllable[]): ThaiSyllable[] {
  for (let k = 0; k + 1 < sylls.length; k++) {
    const lead = sylls[k];
    const next = sylls[k + 1];
    if (lead.rule !== "hidden a (bare consonant)" || lead.onsetClass === "low") continue;
    if (next.onset.length !== 1 || !SONORANTS.includes(next.onset) || next.onsetClass !== "low") continue;
    const cls = lead.onsetClass;
    sylls[k + 1] = {
      ...next,
      onsetClass: cls,
      tone: computeTone(cls, next.live, next.long, next.toneMark),
      rule: `${next.rule}; leading consonant ${lead.onset}`,
    };
  }
  return sylls;
}

function unknownSyllable(text: string): ThaiSyllable {
  return {
    text,
    onset: "",
    onsetClass: "mid",
    vowel: "a",
    long: false,
    coda: "",
    tone: "mid",
    live: false,
    confidence: 0.1,
    rule: "unparsed",
    toneMark: null,
  };
}

/**
 * Analyse a single syllable string (used for user overrides). Picks the best
 * reading that spans the whole string; falls back to DP if none does.
 */
export function analyzeThaiSyllable(text: string): ThaiSyllable {
  const s = text.trim();
  const whole = candidatesAt(s, 0, s.length)
    .filter((c) => c.end === s.length)
    .sort((a, b) => b.score - a.score)[0];
  if (whole) return whole.syl;
  const segs = segmentThaiWord(s);
  if (segs.length === 0) return unknownSyllable(s);
  const last = segs[segs.length - 1];
  return { ...last, text: s, confidence: Math.min(last.confidence, 0.4), rule: `${last.rule} (override spans multiple readings)` };
}

export const TONE_LABELS: Record<ThaiTone, string> = {
  mid: "mid (สามัญ)",
  low: "low (เอก)",
  falling: "falling (โท)",
  high: "high (ตรี)",
  rising: "rising (จัตวา)",
};

export const CODA_LABELS: Record<Coda, string> = {
  "": "open (no final)",
  k: "/k/ (แม่กก)",
  t: "/t/ (แม่กด)",
  p: "/p/ (แม่กบ)",
  m: "/m/ (แม่กม)",
  n: "/n/ (แม่กน)",
  ng: "/ŋ/ (แม่กง)",
  j: "/j/ (แม่เกย)",
  w: "/w/ (แม่เกอว)",
};

export function vowelLabel(v: VowelQuality, long: boolean): string {
  if (v === "ia" || v === "ɯa" || v === "ua") return long ? v : `${v} (short)`;
  return long ? `${v}${v}` : v;
}

/** Phonetic rhyme description such as "ɔɔ + n". */
export function thaiRhymeLabel(s: ThaiSyllable): string {
  const v = vowelLabel(s.vowel, s.long);
  return s.coda ? `${v} + ${s.coda === "ng" ? "ŋ" : s.coda}` : v;
}
