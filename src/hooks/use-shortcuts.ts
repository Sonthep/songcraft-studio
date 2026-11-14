"use client";

import { useEffect, useRef } from "react";

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Buttons, links, sliders etc. handle Space/Enter themselves (keyboard accessibility). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return !!el.closest("button, a[href], [role=button], [role=slider], [role=switch], [role=checkbox], [role=menuitem], [role=tab], [role=option]");
}

export interface Shortcut {
  /** e.g. "space", "mod+z", "mod+shift+z", "delete", "m" */
  combo: string;
  handler: (e: KeyboardEvent) => void;
  /** Also fire while typing in inputs (default false). */
  allowInInputs?: boolean;
}

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  if (mod !== (e.ctrlKey || e.metaKey)) return false;
  if (shift !== e.shiftKey) return false;
  if (alt !== e.altKey) return false;
  const k = e.key.toLowerCase();
  if (key === "space") return e.code === "Space";
  if (key === "delete") return k === "delete" || k === "backspace";
  return k === key;
}

/** Register keyboard shortcuts on window. Handlers are read from a ref so callers needn't memoize. */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const ref = useRef(shortcuts);
  useEffect(() => {
    ref.current = shortcuts;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && !["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) return;
      for (const s of ref.current) {
        if (!matches(e, s.combo)) continue;
        if (!s.allowInInputs && isTypingTarget(e.target)) continue;
        if ((e.code === "Space" || e.key === "Enter") && isInteractiveTarget(e.target)) continue;
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
