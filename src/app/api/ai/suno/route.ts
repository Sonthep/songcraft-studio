import { sunoRequestSchema, sunoResponseSchema } from "@/lib/ai/schemas";
import { getProvider } from "@/lib/server/ai/provider";
import { sunoPrompt } from "@/lib/server/ai/prompts";
import { handleAIError, readJson } from "@/lib/server/ai/route-helpers";

export async function POST(req: Request) {
  const body = await readJson(req, sunoRequestSchema);
  if ("response" in body) return body.response;
  try {
    const provider = await getProvider();
    const { system, prompt } = sunoPrompt(body.data);
    const result = await provider.generate({ system, prompt, schema: sunoResponseSchema, maxTokens: 8000, effort: "low" });
    return Response.json({ result, provider: provider.label, model: provider.model });
  } catch (err) {
    return handleAIError(err);
  }
}
