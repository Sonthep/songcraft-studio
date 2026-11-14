import { z } from "zod";
import { getDb } from "@/lib/persistence/db";
import type { RhymeUnit } from "./rhyme";

export const customRhymeEntrySchema = z.object({
  id: z.string().min(1).max(64),
  word: z.string().trim().min(1).max(80),
  language: z.enum(["th", "isan", "en"]),
  /** Optional rhyme group tag: entries sharing a tag are treated as rhymes. */
  group: z.string().trim().max(60).default(""),
  /** Optional phonetic override of the final syllable (Thai-style inventory). */
  vowel: z.enum(["", "a", "i", "ɯ", "u", "e", "ɛ", "o", "ɔ", "ɤ", "ia", "ɯa", "ua"]).default(""),
  long: z.boolean().default(false),
  coda: z.enum(["", "k", "t", "p", "m", "n", "ng", "j", "w", "auto"]).default("auto"),
  /** Optional manual syllable split, e.g. "อุ-ดร". */
  syllables: z.string().max(200).default(""),
  meaning: z.string().max(300).default(""),
  createdAt: z.number(),
});

export type CustomRhymeEntry = z.infer<typeof customRhymeEntrySchema>;

export async function listCustomRhymes(): Promise<CustomRhymeEntry[]> {
  const db = await getDb();
  const all = await db.getAll("customRhymes");
  return all.sort((a, b) => a.word.localeCompare(b.word, "th"));
}

export async function saveCustomRhyme(entry: CustomRhymeEntry): Promise<void> {
  const db = await getDb();
  await db.put("customRhymes", customRhymeEntrySchema.parse(entry));
}

export async function deleteCustomRhyme(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("customRhymes", id);
}

export interface CustomIndex {
  byWord: Map<string, CustomRhymeEntry>;
}

export function buildCustomIndex(entries: CustomRhymeEntry[]): CustomIndex {
  const byWord = new Map<string, CustomRhymeEntry>();
  for (const e of entries) byWord.set(e.word.trim().toLowerCase(), e);
  return { byWord };
}

/** Apply a custom entry's overrides on top of a computed rhyme unit. */
export function applyCustomOverride(unit: RhymeUnit | null, entry: CustomRhymeEntry | undefined): RhymeUnit | null {
  if (!entry) return unit;
  const hasPhonetic = entry.vowel !== "";
  if (!hasPhonetic && !entry.group) return unit;
  const base: RhymeUnit =
    unit ?? {
      lang: entry.language === "en" ? "en" : "th",
      vowel: "",
      long: false,
      coda: "",
      source: "custom",
      confidence: 1,
      label: entry.word,
    };
  const next: RhymeUnit = { ...base };
  if (hasPhonetic) {
    next.vowel = entry.vowel;
    next.long = entry.long;
    if (entry.coda !== "auto") next.coda = entry.coda;
    next.source = "custom";
    next.confidence = 1;
    next.enTail = undefined;
    next.label = `${entry.long && !["ia", "ɯa", "ua"].includes(entry.vowel) ? entry.vowel + entry.vowel : entry.vowel}${next.coda ? ` + ${next.coda === "ng" ? "ŋ" : next.coda}` : ""} (custom)`;
  }
  if (entry.group) next.customGroup = entry.group;
  return next;
}
