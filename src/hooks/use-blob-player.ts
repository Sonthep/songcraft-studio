"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Plays a Blob with an <audio> element; exposes time for a playhead and optional loop region. */
export function useBlobPlayer(blob: Blob | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const loopRef = useRef<{ start: number; end: number } | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.preload = "auto";
    audioRef.current = a;
    const onEnd = () => setPlaying(false);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("ended", onEnd);
      cancelAnimationFrame(rafRef.current);
      URL.revokeObjectURL(url);
      audioRef.current = null;
      setPlaying(false);
      setTime(0);
    };
  }, [blob]);

  const play = useCallback(
    async (from?: number) => {
      const a = audioRef.current;
      if (!a) return;
      if (from !== undefined) a.currentTime = from;
      else if (loopRef.current && (a.currentTime < loopRef.current.start || a.currentTime >= loopRef.current.end)) a.currentTime = loopRef.current.start;
      const tick = () => {
        const el = audioRef.current;
        if (!el) return;
        const loop = loopRef.current;
        if (loop && el.currentTime >= loop.end) el.currentTime = loop.start;
        setTime(el.currentTime);
        if (!el.paused) rafRef.current = requestAnimationFrame(tick);
      };
      try {
        await a.play();
        setPlaying(true);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setPlaying(false);
      }
    },
    [],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
    setTime(a.currentTime);
  }, []);

  const setLoop = useCallback((loop: { start: number; end: number } | null) => {
    loopRef.current = loop && loop.end > loop.start ? loop : null;
  }, []);

  return { playing, time, play, pause, seek, setLoop };
}

/** Decode a Blob into an AudioBuffer (uses a temporary AudioContext). */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
