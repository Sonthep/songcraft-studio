"use client";

import { useEffect, useState } from "react";
import type { AIErrorBody, AIStatus } from "@/lib/ai/schemas";

let statusPromise: Promise<AIStatus> | null = null;

export function fetchAIStatus(force = false): Promise<AIStatus> {
  if (!statusPromise || force) {
    statusPromise = fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => r.json() as Promise<AIStatus>)
      .catch(() => ({ configured: false, provider: null, model: null, reason: "Could not reach the app server." }));
  }
  return statusPromise;
}

export function useAIStatus(): AIStatus | null {
  const [status, setStatus] = useState<AIStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAIStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export class AIRequestError extends Error {
  constructor(message: string, public code: AIErrorBody["code"] | "network") {
    super(message);
  }
}

/** POST to an AI route and return `result`, throwing AIRequestError with a readable message. */
export async function callAI<T>(path: string, body: unknown, signal?: AbortSignal): Promise<{ result: T; provider: string; model: string }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new AIRequestError("Network error — is the dev server running?", "network");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json as AIErrorBody | null;
    throw new AIRequestError(e?.error ?? `Request failed (${res.status}).`, e?.code ?? "provider_error");
  }
  return json as { result: T; provider: string; model: string };
}
