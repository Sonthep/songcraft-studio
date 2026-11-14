import { SCALES, SCALE_NAMES, SHARP_NAMES, FLAT_NAMES, midiToName, type ScaleName } from "@/lib/music/theory";
import { GENRES, LANGUAGES, LANGUAGE_LABELS, SECTION_LABELS, SECTION_TYPES, type Language, type SectionType } from "@/lib/project/schema";
import type { Option } from "./form";

export const KEY_OPTIONS: Option<string>[] = SHARP_NAMES.map((n, i) => ({
  value: String(i),
  label: n === FLAT_NAMES[i] ? n : `${n} / ${FLAT_NAMES[i]}`,
}));

export const SCALE_OPTIONS: Option<ScaleName>[] = SCALE_NAMES.map((s) => ({ value: s, label: SCALES[s].label }));

export const TIME_SIGNATURE_OPTIONS: Option<string>[] = ["4/4", "3/4", "6/8", "2/4", "12/8", "5/4", "7/8"].map((t) => ({ value: t, label: t }));

export const GENRE_OPTIONS: Option<string>[] = GENRES.map((g) => ({ value: g, label: g }));

export const LANGUAGE_OPTIONS: Option<Language>[] = LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }));

export const SECTION_OPTIONS: Option<SectionType>[] = SECTION_TYPES.map((t) => ({ value: t, label: SECTION_LABELS[t] }));

/** Vocal range options C2..C6. */
export const PITCH_OPTIONS: Option<string>[] = Array.from({ length: 49 }, (_, i) => {
  const p = 36 + i;
  return { value: String(p), label: midiToName(p) };
});

export function parseTimeSignature(v: string): { numerator: number; denominator: 2 | 4 | 8 | 16 } {
  const [n, d] = v.split("/").map(Number);
  return { numerator: n || 4, denominator: ([2, 4, 8, 16].includes(d) ? d : 4) as 2 | 4 | 8 | 16 };
}
