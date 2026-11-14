import "server-only";
import { englishRhymeUnitFromPhones } from "@/lib/lyrics/rhyme";
import { isVowelPhone, rhymeTailFromPhones, stripStress } from "@/lib/lyrics/english";

/**
 * Server-side access to the CMU Pronouncing Dictionary (~134k entries, ~4.7MB).
 * Loaded lazily on first request and cached for the life of the server process.
 */

type Dict = Record<string, string>;

let dictPromise: Promise<Dict> | null = null;
let tailIndex: Map<string, string[]> | null = null;
let vowelIndex: Map<string, string[]> | null = null;
let thaiUnitIndex: Map<string, string[]> | null = null;

async function loadDict(): Promise<Dict> {
  if (!dictPromise) {
    dictPromise = import("cmu-pronouncing-dictionary").then((m) => m.dictionary as Dict);
  }
  return dictPromise;
}

function cleanWord(w: string): string | null {
  // Skip alternates like "read(1)" and entries with punctuation.
  if (!/^[a-z]+$/.test(w)) return null;
  return w;
}

async function buildIndexes() {
  if (tailIndex && vowelIndex && thaiUnitIndex) return;
  const dict = await loadDict();
  tailIndex = new Map();
  vowelIndex = new Map();
  thaiUnitIndex = new Map();
  for (const [raw, pron] of Object.entries(dict)) {
    const w = cleanWord(raw);
    if (!w) continue;
    const phones = pron.split(" ");
    const tail = rhymeTailFromPhones(phones).join(" ");
    push(tailIndex, tail, w);
    const v = rhymeTailFromPhones(phones)[0];
    if (v && isVowelPhone(v)) push(vowelIndex, stripStress(v), w);
    const unit = englishRhymeUnitFromPhones(phones);
    push(thaiUnitIndex, `${unit.vowel}|${unit.long}|${unit.coda}`, w);
  }
}

function push(m: Map<string, string[]>, k: string, w: string) {
  const arr = m.get(k);
  if (arr) arr.push(w);
  else m.set(k, [w]);
}

/**
 * Sort candidates (shortest first) and keep one spelling per pronunciation so
 * variant spellings of names ("hart", "harte", "hartt") don't flood the list.
 * The CMU dictionary has no frequency data, so results are not popularity-ranked.
 */
function rank(words: string[], exclude: string, limit: number, dict?: Dict): string[] {
  const excludePron = dict?.[exclude];
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = words
    .filter((w) => w !== exclude && w.length >= 2 && w.length <= 14)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const w of sorted) {
    const pron = dict?.[w];
    if (pron) {
      if (pron === excludePron || seen.has(pron)) continue;
      seen.add(pron);
    }
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

export async function lookupPronunciations(words: string[]): Promise<Record<string, string[] | null>> {
  const dict = await loadDict();
  const out: Record<string, string[] | null> = {};
  for (const w of words) {
    const key = w.toLowerCase();
    const p = dict[key];
    out[key] = p ? p.split(" ") : null;
  }
  return out;
}

export interface EnglishRhymeResponse {
  word: string;
  phones: string[] | null;
  tail: string[] | null;
  perfect: string[];
  near: string[];
  multisyllabic: string[];
}

export async function englishRhymes(word: string, limit = 120): Promise<EnglishRhymeResponse> {
  const dict = await loadDict();
  await buildIndexes();
  const key = word.toLowerCase().trim();
  const pron = dict[key];
  if (!pron) return { word: key, phones: null, tail: null, perfect: [], near: [], multisyllabic: [] };
  const phones = pron.split(" ");
  const tail = rhymeTailFromPhones(phones);
  const perfect = rank(tailIndex!.get(tail.join(" ")) ?? [], key, limit, dict);

  // Near: same stressed vowel, final consonant of the same class (or both open).
  const v = tail[0];
  const unit = englishRhymeUnitFromPhones(phones);
  const nearPool = (vowelIndex!.get(stripStress(v)) ?? []).filter((w) => {
    const p = dict[w];
    if (!p) return false;
    const u = englishRhymeUnitFromPhones(p.split(" "));
    const t = rhymeTailFromPhones(p.split(" ")).join(" ");
    return t !== tail.join(" ") && sameCodaClass(u.coda, unit.coda);
  });
  const near = rank(nearPool, key, limit, dict);

  // Multisyllabic: match the last two vowel nuclei and everything after them.
  const vowelPositions = phones.map((p, i) => (isVowelPhone(p) ? i : -1)).filter((i) => i >= 0);
  let multisyllabic: string[] = [];
  if (vowelPositions.length >= 2) {
    const from = vowelPositions[vowelPositions.length - 2];
    const target = phones.slice(from).map(stripStress).join(" ");
    const pool = (tailIndex!.get(tail.join(" ")) ?? []).filter((w) => {
      const ph = dict[w]?.split(" ") ?? [];
      const vp = ph.map((p, i) => (isVowelPhone(p) ? i : -1)).filter((i) => i >= 0);
      if (vp.length < 2) return false;
      return ph.slice(vp[vp.length - 2]).map(stripStress).join(" ") === target;
    });
    multisyllabic = rank(pool, key, limit, dict);
  }
  return { word: key, phones, tail, perfect, near, multisyllabic };
}

const CLASS: Record<string, string> = { "": "open", m: "nasal", n: "nasal", ng: "nasal", k: "stop", t: "stop", p: "stop", j: "glide", w: "glide" };
function sameCodaClass(a: string, b: string) {
  return CLASS[a] === CLASS[b];
}

/** English words whose approximate Thai-style rhyme (vowel+length+final) equals the given unit. */
export async function englishForThaiUnit(vowel: string, long: boolean, coda: string, limit = 60): Promise<string[]> {
  const dict = await loadDict();
  await buildIndexes();
  return rank(thaiUnitIndex!.get(`${vowel}|${long}|${coda}`) ?? [], "", limit, dict);
}
