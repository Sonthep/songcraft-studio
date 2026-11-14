"use client";

import { create } from "zustand";
import { produce, type Draft } from "immer";
import type { Project } from "@/lib/project/schema";
import { repository } from "@/lib/persistence/repository";

const HISTORY_LIMIT = 150;
const COALESCE_MS = 1200;

export type SaveState = "saved" | "dirty" | "saving" | "error";

interface UpdateOptions {
  /** Changes with the same key within ~1s merge into one undo step (e.g. typing). */
  coalesce?: string;
  /** Set false for changes that should not be undoable (e.g. adding a recording). */
  history?: boolean;
}

interface ProjectState {
  project: Project | null;
  loadState: "idle" | "loading" | "ready" | "notfound" | "error";
  loadError: string | null;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  revision: number;
  savedRevision: number;
  past: Project[];
  future: Project[];
  lastCommit: { key: string | null; at: number };

  load(id: string): Promise<void>;
  unload(): void;
  update(recipe: (draft: Draft<Project>) => void, opts?: UpdateOptions): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
}

/** Audio assets are tied to stored blobs, so undo/redo never brings back or drops them. */
function withCurrentAssets(snapshot: Project, current: Project): Project {
  return { ...snapshot, audioAssets: current.audioAssets };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  loadState: "idle",
  loadError: null,
  saveState: "saved",
  saveError: null,
  lastSavedAt: null,
  revision: 0,
  savedRevision: 0,
  past: [],
  future: [],
  lastCommit: { key: null, at: 0 },

  async load(id) {
    if (get().project?.id === id && get().loadState === "ready") return;
    set({ loadState: "loading", loadError: null, project: null, past: [], future: [] });
    try {
      const p = await repository.get(id);
      if (!p) {
        set({ loadState: "notfound" });
        return;
      }
      set({
        project: p,
        loadState: "ready",
        saveState: "saved",
        saveError: null,
        lastSavedAt: p.updatedAt,
        revision: 0,
        savedRevision: 0,
        past: [],
        future: [],
        lastCommit: { key: null, at: 0 },
      });
      try {
        localStorage.setItem("songcraft:lastProject", id);
      } catch {
        /* storage unavailable */
      }
    } catch (err) {
      set({ loadState: "error", loadError: err instanceof Error ? err.message : String(err) });
    }
  },

  unload() {
    set({ project: null, loadState: "idle", past: [], future: [], revision: 0, savedRevision: 0 });
  },

  update(recipe, opts = {}) {
    const { project, past, lastCommit, revision } = get();
    if (!project) return;
    const next = produce(project, recipe);
    if (next === project) return;
    const now = Date.now();
    const history = opts.history !== false;
    const coalesce = history && opts.coalesce != null && lastCommit.key === opts.coalesce && now - lastCommit.at < COALESCE_MS;
    set({
      project: next,
      past: history && !coalesce ? [...past, project].slice(-HISTORY_LIMIT) : past,
      future: history ? [] : get().future,
      lastCommit: history ? { key: opts.coalesce ?? null, at: now } : lastCommit,
      revision: revision + 1,
      saveState: "dirty",
    });
  },

  undo() {
    const { project, past, future, revision } = get();
    if (!project || past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      project: withCurrentAssets(prev, project),
      past: past.slice(0, -1),
      future: [project, ...future].slice(0, HISTORY_LIMIT),
      lastCommit: { key: null, at: 0 },
      revision: revision + 1,
      saveState: "dirty",
    });
  },

  redo() {
    const { project, past, future, revision } = get();
    if (!project || future.length === 0) return;
    const next = future[0];
    set({
      project: withCurrentAssets(next, project),
      past: [...past, project].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      lastCommit: { key: null, at: 0 },
      revision: revision + 1,
      saveState: "dirty",
    });
  },

  async save() {
    const { project, revision, saveState } = get();
    if (!project || saveState === "saving") return;
    set({ saveState: "saving", saveError: null });
    try {
      const saved = await repository.save(project);
      const stillCurrent = get().revision === revision;
      set((s) => ({
        savedRevision: revision,
        lastSavedAt: saved.updatedAt,
        saveState: stillCurrent ? "saved" : "dirty",
        // Keep updatedAt in sync without creating an undo step.
        project: s.project && stillCurrent ? { ...s.project, updatedAt: saved.updatedAt } : s.project,
      }));
    } catch (err) {
      set({ saveState: "error", saveError: err instanceof Error ? err.message : String(err) });
    }
  },
}));

export function useProject(): Project | null {
  return useProjectStore((s) => s.project);
}
