import { lyricsRequestSchema, lyricsResponseSchema } from "@/lib/ai/schemas";
import { getProvider } from "@/lib/server/ai/provider";
import { lyricsPrompt } from "@/lib/server/ai/prompts";
import { handleAIError, readJson } from "@/lib/server/ai/route-helpers";

export async function POST(req: Request) {
  const body = await readJson(req, lyricsRequestSchema);
  if ("response" in body) return body.response;
  try {
    const provider = await getProvider();
    const { system, prompt } = lyricsPrompt(body.data);
    const result = await provider.generate({ system, prompt, schema: lyricsResponseSchema, maxTokens: 16000, effort: "medium" });
    return Response.json({ result, provider: provider.label, model: provider.model });
  } catch (err) {
    return handleAIError(err);
  }
}
