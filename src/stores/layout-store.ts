"use client";

import { create } from "zustand";

const KEY = "songcraft:layout";

interface LayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  hydrated: boolean;
  hydrate(): void;
  toggle(side: "left" | "right"): void;
}

/** Per-browser workspace layout preferences (convenience only; safe to lose). */
export const useLayoutStore = create<LayoutState>((set, get) => ({
  leftOpen: true,
  rightOpen: true,
  hydrated: false,
  hydrate() {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as Partial<LayoutState>) : {};
      set({ leftOpen: v.leftOpen ?? true, rightOpen: v.rightOpen ?? true, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  toggle(side) {
    const next = side === "left" ? { leftOpen: !get().leftOpen } : { rightOpen: !get().rightOpen };
    set(next);
    try {
      const { leftOpen, rightOpen } = { ...get(), ...next };
      localStorage.setItem(KEY, JSON.stringify({ leftOpen, rightOpen }));
    } catch {
      /* storage unavailable */
    }
  },
}));
