import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AIProviderError, modelFor, type AIProvider, type StructuredRequest } from "./provider";

/**
 * Claude adapter: structured JSON output validated against the Zod schema,
 * adaptive thinking, explicit effort, and server-side refusal fallbacks.
 */
export function createAnthropicProvider(): AIProvider {
  const client = new Anthropic();
  const model = modelFor("anthropic");
  return {
    id: "anthropic",
    label: "Anthropic Claude",
    model,
    async generate<T>(req: StructuredRequest<T>): Promise<T> {
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: req.maxTokens ?? 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
        });
        if (response.stop_reason === "refusal") {
          throw new AIProviderError("The model declined this request.", "refused", 422);
        }
        if (response.stop_reason === "max_tokens") {
          throw new AIProviderError("The response was cut off (max tokens). Try a smaller selection.", "bad_output", 502);
        }
        const parsed = response.parsed_output;
        if (parsed == null) {
          throw new AIProviderError("The model returned no structured output.", "bad_output", 502);
        }
        const checked = req.schema.safeParse(parsed);
        if (!checked.success) {
          throw new AIProviderError("The model output did not match the expected format.", "bad_output", 502);
        }
        return checked.data;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new AIProviderError("Authentication with Anthropic failed. Check ANTHROPIC_API_KEY.", "auth", 401);
        }
        if (err instanceof Anthropic.RateLimitError) {
          throw new AIProviderError("Rate limited by the AI provider. Please wait and try again.", "rate_limited", 429);
        }
        if (err instanceof Anthropic.BadRequestError) {
          throw new AIProviderError(`The AI provider rejected the request: ${err.message}`, "invalid_request", 400);
        }
        if (err instanceof Anthropic.APIConnectionError) {
          throw new AIProviderError("Could not reach the AI provider. Check your network connection.", "provider_error", 502);
        }
        if (err instanceof Anthropic.APIError) {
          throw new AIProviderError(`AI provider error (${err.status ?? "unknown"}).`, "provider_error", 502);
        }
        throw new AIProviderError("Unexpected error while calling the AI provider.", "provider_error", 500);
      }
    },
  };
}
