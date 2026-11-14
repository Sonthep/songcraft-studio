import "server-only";
import type { z } from "zod";
import type { AIErrorBody, AIStatus } from "@/lib/ai/schemas";

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

/**
 * Provider-agnostic interface. Each provider returns data that has already been
 * validated against the caller's Zod schema, or throws AIProviderError.
 */
export interface AIProvider {
  id: string;
  label: string;
  model: string;
  generate<T>(req: StructuredRequest<T>): Promise<T>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public code: AIErrorBody["code"],
    public status: number,
  ) {
    super(message);
  }
}

type ProviderFactory = () => Promise<AIProvider>;

/**
 * Registered providers. Add new adapters here (each in its own module) and
 * select them with AI_PROVIDER.
 */
const PROVIDERS: Record<string, { label: string; isConfigured: () => boolean; create: ProviderFactory }> = {
  anthropic: {
    label: "Anthropic Claude",
    // The SDK also resolves `ant auth login` profiles, so an explicit AI_PROVIDER=anthropic counts as configured.
    isConfigured: () =>
      !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN || process.env.AI_PROVIDER === "anthropic",
    create: async () => (await import("./anthropic")).createAnthropicProvider(),
  },
};

function selectedProviderId(): string | null {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "none" || explicit === "off") return null;
  if (explicit) return explicit;
  for (const [id, p] of Object.entries(PROVIDERS)) if (p.isConfigured()) return id;
  return null;
}

export function getAIStatus(): AIStatus {
  const id = selectedProviderId();
  if (!id) {
    return {
      configured: false,
      provider: null,
      model: null,
      reason: "No AI provider configured. Set ANTHROPIC_API_KEY (or AI_PROVIDER) in .env.local and restart the server.",
    };
  }
  const p = PROVIDERS[id];
  if (!p) return { configured: false, provider: id, model: null, reason: `Unknown AI_PROVIDER "${id}".` };
  if (!p.isConfigured()) {
    return { configured: false, provider: id, model: null, reason: `${p.label} is selected but has no credentials.` };
  }
  return { configured: true, provider: p.label, model: modelFor(id) };
}

export function modelFor(id: string): string {
  if (id === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
  return "unknown";
}

let cached: { id: string; provider: AIProvider } | null = null;

export async function getProvider(): Promise<AIProvider> {
  const status = getAIStatus();
  const id = selectedProviderId();
  if (!status.configured || !id) {
    throw new AIProviderError(status.reason ?? "AI provider not configured.", "not_configured", 503);
  }
  if (cached?.id === id) return cached.provider;
  const provider = await PROVIDERS[id].create();
  cached = { id, provider };
  return provider;
}
