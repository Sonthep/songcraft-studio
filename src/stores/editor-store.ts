"use client";

import { create } from "zustand";
import type { Clipboard } from "@/lib/music/note-ops";

export type PianoTool = "draw" | "select";

interface EditorState {
  selectedNoteIds: string[];
  clipboard: Clipboard | null;
  gridId: string;
  snap: boolean;
  tool: PianoTool;
  /** Pixels per quarter note. */
  zoomX: number;
  /** Pixels per semitone row. */
  zoomY: number;
  followPlayhead: boolean;
  showChordTones: boolean;
  showLyrics: boolean;
  setSelection(ids: string[]): void;
  toggleSelected(id: string): void;
  setClipboard(c: Clipboard | null): void;
  set<K extends keyof EditorState>(key: K, value: EditorState[K]): void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedNoteIds: [],
  clipboard: null,
  gridId: "1/16",
  snap: true,
  tool: "draw",
  zoomX: 96,
  zoomY: 16,
  followPlayhead: true,
  showChordTones: true,
  showLyrics: true,
  setSelection: (ids) => set({ selectedNoteIds: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedNoteIds: s.selectedNoteIds.includes(id)
        ? s.selectedNoteIds.filter((x) => x !== id)
        : [...s.selectedNoteIds, id],
    })),
  setClipboard: (c) => set({ clipboard: c }),
  set: (key, value) => set({ [key]: value } as Partial<EditorState>),
}));
