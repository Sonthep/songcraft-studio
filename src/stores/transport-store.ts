"use client";

import { create } from "zustand";
import { DEFAULT_MIX, type MixSettings } from "@/lib/audio/engine";

interface TransportState {
  isPlaying: boolean;
  positionTicks: number;
  metronome: boolean;
  loop: { enabled: boolean; start: number; end: number };
  mix: MixSettings;
  /** Set while something other than the project is loaded (e.g. a melody candidate audition). */
  previewLabel: string | null;
  /** Registered by the Vocal Recorder page; the transport Record button calls it. */
  recordHandler: (() => void) | null;
  isRecording: boolean;
  audioReady: boolean;
  audioError: string | null;
  set(partial: Partial<Omit<TransportState, "set">>): void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  positionTicks: 0,
  metronome: false,
  loop: { enabled: false, start: 0, end: 480 * 16 },
  mix: { ...DEFAULT_MIX },
  previewLabel: null,
  recordHandler: null,
  isRecording: false,
  audioReady: false,
  audioError: null,
  set: (partial) => set(partial),
}));
