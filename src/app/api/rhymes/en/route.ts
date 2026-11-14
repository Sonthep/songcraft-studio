import { englishRhymes } from "@/lib/server/cmu";

export async function GET(req: Request) {
  const word = new URL(req.url).searchParams.get("word")?.trim().toLowerCase() ?? "";
  if (!/^[a-z']{1,40}$/.test(word)) {
    return Response.json({ error: "Provide ?word= with letters only (max 40)." }, { status: 400 });
  }
  return Response.json(await englishRhymes(word.replace(/'/g, "")));
}
