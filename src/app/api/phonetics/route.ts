import { z } from "zod";
import { lookupPronunciations } from "@/lib/server/cmu";

const bodySchema = z.object({ words: z.array(z.string().max(40)).max(2000) });

/** English pronunciations (ARPAbet) from the CMU Pronouncing Dictionary. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Expected { words: string[] } (max 2000)." }, { status: 400 });
  const words = parsed.data.words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean);
  return Response.json({ pronunciations: await lookupPronunciations(words) });
}
