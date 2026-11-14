"use client";

import { create } from "zustand";
import type { LyricsResponse, LyricsTask, SuggestionMode } from "@/lib/ai/schemas";

export interface AssistantRun {
  id: string;
  projectId: string;
  task: LyricsTask;
  mode: SuggestionMode;
  createdAt: number;
  provider: string;
  model: string;
  response: LyricsResponse;
  /** suggestion index -> state */
  status: Record<number, "open" | "applied" | "dismissed">;
}

interface AssistantState {
  runs: AssistantRun[];
  addRun(run: AssistantRun): void;
  setStatus(runId: string, index: number, status: "open" | "applied" | "dismissed"): void;
  clear(projectId: string): void;
}

/** Session-only store of AI suggestions (never auto-applied to lyrics). */
export const useAssistantStore = create<AssistantState>((set) => ({
  runs: [],
  addRun: (run) => set((s) => ({ runs: [run, ...s.runs].slice(0, 20) })),
  setStatus: (runId, index, status) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? { ...r, status: { ...r.status, [index]: status } } : r)),
    })),
  clear: (projectId) => set((s) => ({ runs: s.runs.filter((r) => r.projectId !== projectId) })),
}));
