"use client";

import { useEffect } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";

/**
 * Keeps the audio engine in sync with the open project and mirrors the
 * transport position into the store (one rAF loop for the whole workspace).
 */
export function useTransportSync() {
  const notes = useProjectStore((s) => s.project?.notes);
  const chords = useProjectStore((s) => s.project?.chords);
  const bpm = useProjectStore((s) => s.project?.bpm);
  const ts = useProjectStore((s) => s.project?.timeSignature);
  const previewLabel = useTransportStore((s) => s.previewLabel);

  useEffect(() => {
    if (previewLabel || !notes || !chords || !bpm || !ts) return;
    audioEngine.setContent({ bpm, timeSignature: ts, notes, chords });
  }, [notes, chords, bpm, ts, previewLabel]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (audioEngine.started) {
        const st = useTransportStore.getState();
        const playing = audioEngine.isPlaying();
        const pos = audioEngine.getTicks();
        if (playing !== st.isPlaying || (playing && Math.abs(pos - st.positionTicks) >= 1)) {
          st.set({ isPlaying: playing, positionTicks: playing ? pos : st.positionTicks });
        }
        if (!playing && st.previewLabel && pos === 0 && st.isPlaying) {
          st.set({ isPlaying: false });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stop audio when leaving the workspace.
  useEffect(() => () => audioEngine.stop(), []);
}
