/**
 * Initial-consonant sounds for alliteration (Thai สัมผัสอักษร).
 *
 * Alliteration is matched by *sound*, not letter: ข ค ฆ are all /kʰ/, ซ ศ ษ ส
 * are all /s/, and a silent leading ห or อ (หนาว, อย่า) takes the sound of the
 * consonant it leads. English uses the first CMU phone of the syllable, or a
 * spelling estimate (flagged) when the word is not in the dictionary.
 */

export interface OnsetSound {
  /** Comparison key: equal keys alliterate. Language-prefixed (th:/en:). */
  key: string;
  /** Display label, e.g. "/kʰ/". */
  label: string;
  /** True for spelling-based English estimates and Thai clusters. */
  approximate: boolean;
}

const THAI_ONSET: Record<string, string> = {};
const set = (letters: string, sound: string) => {
  for (const c of letters) THAI_ONSET[c] = sound;
};
set("ก", "k");
set("ขฃคฅฆ", "kʰ");
set("ง", "ŋ");
set("จ", "tɕ");
set("ฉชฌ", "tɕʰ");
set("ซศษส", "s");
set("ญย", "j");
set("ฎด", "d");
set("ฏต", "t");
set("ฐฑฒถทธ", "tʰ");
set("ณน", "n");
set("บ", "b");
set("ป", "p");
set("ผพภ", "pʰ");
set("ฝฟ", "f");
set("ม", "m");
set("ร", "r");
set("ลฬ", "l");
set("ว", "w");
set("หฮ", "h");
set("อ", "ʔ");

const SONORANTS = "งญนมยรลวณ";

/** Initial sound of a Thai syllable from its written onset letters. */
export function thaiOnsetSound(onset: string): OnsetSound | null {
  if (!onset) return null;
  let letters = onset;
  // Silent leading ห (หน หม หย หร หล หว หง หญ) and อ in อย่า/อยู่/อย่าง/อยาก.
  if (letters.length >= 2 && letters[0] === "ห" && SONORANTS.includes(letters[1])) letters = letters.slice(1);
  else if (letters.startsWith("อย")) letters = letters.slice(1);
  const sound = THAI_ONSET[letters[0]];
  if (!sound) return null;
  const cluster = letters.length >= 2 && "รลว".includes(letters[1]);
  return { key: `th:${sound}`, label: `/${sound}/`, approximate: cluster };
}

/** ARPAbet consonant -> label. Vowel-initial syllables return null. */
const ARPA_ONSET: Record<string, string> = {
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "g", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m",
  N: "n", NG: "ŋ", P: "p", R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

export function englishOnsetFromPhones(phones: string[]): OnsetSound | null {
  const first = phones[0]?.replace(/\d$/, "");
  const sound = first ? ARPA_ONSET[first] : undefined;
  return sound ? { key: `en:${sound}`, label: `/${sound}/`, approximate: false } : null;
}

/** Spelling estimate for English words that are not in the dictionary. */
export function englishOnsetFromSpelling(word: string): OnsetSound | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w || /^[aeiou]/.test(w)) return null;
  const digraphs: Array<[RegExp, string]> = [
    [/^ch/, "tʃ"], [/^sh/, "ʃ"], [/^th/, "θ"], [/^ph/, "f"], [/^wh/, "w"], [/^kn/, "n"], [/^wr/, "r"],
    [/^gn/, "n"], [/^c[eiy]/, "s"], [/^c/, "k"], [/^q/, "k"], [/^x/, "z"], [/^y/, "j"], [/^j/, "dʒ"],
  ];
  let sound = w[0];
  for (const [re, s] of digraphs) {
    if (re.test(w)) {
      sound = s;
      break;
    }
  }
  return { key: `en:${sound}`, label: `/${sound}/`, approximate: true };
}
