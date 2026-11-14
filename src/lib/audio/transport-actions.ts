"use client";

import { audioEngine, type MixSettings, type PlaybackContent } from "./engine";
import { useTransportStore } from "@/stores/transport-store";

function setErr(err: unknown) {
  useTransportStore.getState().set({
    audioError: err instanceof Error ? err.message : "Audio could not start. Click anywhere and try again.",
  });
}

export async function startAudio(): Promise<boolean> {
  try {
    await audioEngine.ensureStarted();
    useTransportStore.getState().set({ audioReady: true, audioError: null });
    return true;
  } catch (err) {
    setErr(err);
    return false;
  }
}

export async function togglePlay() {
  try {
    if (audioEngine.isPlaying()) {
      audioEngine.pause();
    } else {
      await audioEngine.play();
    }
    useTransportStore.getState().set({ isPlaying: audioEngine.isPlaying(), audioReady: true, audioError: null });
  } catch (err) {
    setErr(err);
  }
}

export async function playFrom(tick: number) {
  try {
    await audioEngine.play(tick);
    useTransportStore.getState().set({ isPlaying: true, audioReady: true, audioError: null });
  } catch (err) {
    setErr(err);
  }
}

export function stopPlayback() {
  audioEngine.stop();
  useTransportStore.getState().set({ isPlaying: false, positionTicks: 0 });
}

export function seekTo(tick: number) {
  audioEngine.seek(tick);
  useTransportStore.getState().set({ positionTicks: Math.max(0, tick) });
}

export function toggleMetronome() {
  const on = !useTransportStore.getState().metronome;
  audioEngine.setMetronome(on);
  useTransportStore.getState().set({ metronome: on });
}

export function setLoop(loop: { enabled: boolean; start: number; end: number }) {
  audioEngine.setLoop(loop.enabled, loop.start, loop.end);
  useTransportStore.getState().set({ loop });
}

export function setMix(partial: Partial<MixSettings>) {
  const mix = { ...useTransportStore.getState().mix, ...partial };
  audioEngine.setMix(mix);
  useTransportStore.getState().set({ mix });
}

/** Temporarily play something other than the project (e.g. a melody candidate). */
export async function startPreview(label: string, content: PlaybackContent, fromTick = 0) {
  audioEngine.stop();
  useTransportStore.getState().set({ previewLabel: label });
  audioEngine.setContent(content);
  await playFrom(fromTick);
}

/** Stop a preview; the workspace sync hook reloads the project content. */
export function endPreview() {
  audioEngine.stop();
  useTransportStore.getState().set({ previewLabel: null, isPlaying: false, positionTicks: 0 });
}
