import { coachRequestSchema, coachResponseSchema } from "@/lib/ai/schemas";
import { getProvider } from "@/lib/server/ai/provider";
import { coachPrompt } from "@/lib/server/ai/prompts";
import { handleAIError, readJson } from "@/lib/server/ai/route-helpers";

export async function POST(req: Request) {
  const body = await readJson(req, coachRequestSchema);
  if ("response" in body) return body.response;
  try {
    const provider = await getProvider();
    const { system, prompt } = coachPrompt(body.data);
    const result = await provider.generate({ system, prompt, schema: coachResponseSchema, maxTokens: 16000, effort: "medium" });
    return Response.json({ result, provider: provider.label, model: provider.model });
  } catch (err) {
    return handleAIError(err);
  }
}
