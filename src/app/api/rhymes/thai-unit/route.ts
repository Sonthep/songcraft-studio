import { englishForThaiUnit } from "@/lib/server/cmu";

const VOWELS = new Set(["a", "i", "ɯ", "u", "e", "ɛ", "o", "ɔ", "ɤ", "ia", "ɯa", "ua"]);
const CODAS = new Set(["", "k", "t", "p", "m", "n", "ng", "j", "w"]);

/** English words whose approximate rhyme matches a Thai vowel + final (cross-language, approximate). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const vowel = sp.get("vowel") ?? "";
  const coda = sp.get("coda") ?? "";
  const long = sp.get("long") === "true";
  if (!VOWELS.has(vowel) || !CODAS.has(coda)) {
    return Response.json({ error: "Invalid vowel/coda." }, { status: 400 });
  }
  return Response.json({ words: await englishForThaiUnit(vowel, long, coda) });
}
