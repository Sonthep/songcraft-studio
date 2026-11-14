import "server-only";
import type { z } from "zod";
import type { AIErrorBody } from "@/lib/ai/schemas";
import { AIProviderError } from "./provider";

const MAX_BODY_BYTES = 200_000;

export function errorResponse(body: AIErrorBody, status: number) {
  return Response.json(body, { status });
}

/** Read and validate a JSON request body with a size limit. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { response: Response }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return { response: errorResponse({ error: "Request too large.", code: "invalid_request" }, 413) };
  }
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return { response: errorResponse({ error: "Request too large.", code: "invalid_request" }, 413) };
    }
    raw = JSON.parse(text);
  } catch {
    return { response: errorResponse({ error: "Invalid JSON body.", code: "invalid_request" }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      response: errorResponse(
        { error: `Invalid request: ${issue?.path.join(".") || "body"} ${issue?.message ?? ""}`.trim(), code: "invalid_request" },
        400,
      ),
    };
  }
  return { data: parsed.data };
}

export function handleAIError(err: unknown): Response {
  if (err instanceof AIProviderError) return errorResponse({ error: err.message, code: err.code }, err.status);
  console.error("[ai] unexpected error", err);
  return errorResponse({ error: "Unexpected server error.", code: "provider_error" }, 500);
}
