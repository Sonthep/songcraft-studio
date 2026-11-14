"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";

/** Debounced autosave plus an unsaved-changes warning when closing the tab. */
export function useAutosave(delayMs = 800) {
  const revision = useProjectStore((s) => s.revision);
  const savedRevision = useProjectStore((s) => s.savedRevision);
  const saveState = useProjectStore((s) => s.saveState);

  useEffect(() => {
    if (revision === savedRevision || saveState === "saving") return;
    const t = setTimeout(() => void useProjectStore.getState().save(), delayMs);
    return () => clearTimeout(t);
  }, [revision, savedRevision, saveState, delayMs]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useProjectStore.getState();
      if (s.project && (s.revision !== s.savedRevision || s.saveState === "saving" || s.saveState === "error")) {
        void s.save();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}
