"use client";

import { create } from "zustand";
import {
  buildCustomIndex,
  deleteCustomRhyme,
  listCustomRhymes,
  saveCustomRhyme,
  type CustomIndex,
  type CustomRhymeEntry,
} from "@/lib/lyrics/custom-dictionary";

interface DictionaryState {
  entries: CustomRhymeEntry[];
  index: CustomIndex;
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;
  upsert(entry: CustomRhymeEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  entries: [],
  index: buildCustomIndex([]),
  loaded: false,
  error: null,
  async load() {
    if (get().loaded) return;
    try {
      const entries = await listCustomRhymes();
      set({ entries, index: buildCustomIndex(entries), loaded: true, error: null });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : String(err) });
    }
  },
  async upsert(entry) {
    await saveCustomRhyme(entry);
    const entries = [...get().entries.filter((e) => e.id !== entry.id), entry].sort((a, b) => a.word.localeCompare(b.word, "th"));
    set({ entries, index: buildCustomIndex(entries) });
  },
  async remove(id) {
    await deleteCustomRhyme(id);
    const entries = get().entries.filter((e) => e.id !== id);
    set({ entries, index: buildCustomIndex(entries) });
  },
}));
