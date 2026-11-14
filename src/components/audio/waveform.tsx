"use client";

import { useEffect, useRef, useState } from "react";
import { computePeaks } from "@/lib/audio/wav";
import { cn } from "@/lib/utils";

export interface WaveformProps {
  buffer: AudioBuffer | null;
  height?: number;
  playheadSec?: number;
  selection?: { start: number; end: number } | null;
  /** Drag to select a region (seconds); a click (no drag) seeks. */
  onSelect?: (sel: { start: number; end: number } | null) => void;
  onSeek?: (sec: number) => void;
  color?: string;
  className?: string;
  label?: string;
}

/** Canvas waveform (min/max peaks) with playhead and draggable selection. */
export function Waveform({ buffer, height = 96, playheadSec, selection, onSelect, onSeek, color = "#6ee7c8", className, label = "Audio waveform" }: WaveformProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const dragRef = useRef<{ x0: number; moved: boolean } | null>(null);
  const [dragSel, setDragSel] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(100, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, height / 2, width, 1);
    if (!buffer) return;
    const peaks = computePeaks(buffer.getChannelData(0), width);
    ctx.fillStyle = color;
    const mid = height / 2;
    for (let x = 0; x < peaks.length; x++) {
      const { min, max } = peaks[x];
      const y1 = mid - max * mid * 0.95;
      const y2 = mid - min * mid * 0.95;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }, [buffer, width, height, color]);

  const duration = buffer?.duration ?? 0;
  const secAt = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };
  const shown = dragSel ?? selection ?? null;

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full touch-none rounded-md bg-background/60", (onSelect || onSeek) && "cursor-text", className)}
      style={{ height }}
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        if (!buffer || (!onSelect && !onSeek)) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { x0: secAt(e.clientX), moved: false };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d || !onSelect) return;
        const t = secAt(e.clientX);
        if (Math.abs(t - d.x0) > duration * 0.003) d.moved = true;
        if (d.moved) setDragSel({ start: Math.min(d.x0, t), end: Math.max(d.x0, t) });
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        if (d.moved && dragSel && onSelect) onSelect(dragSel);
        else onSeek?.(secAt(e.clientX));
        setDragSel(null);
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
      {shown && duration > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 border-x border-mint/70 bg-mint/15"
          style={{ left: `${(shown.start / duration) * 100}%`, width: `${((shown.end - shown.start) / duration) * 100}%` }}
        />
      )}
      {playheadSec !== undefined && duration > 0 && (
        <div className="pointer-events-none absolute inset-y-0 w-px bg-playhead" style={{ left: `${(playheadSec / duration) * 100}%` }} />
      )}
      {!buffer && <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">No audio</div>}
    </div>
  );
}

export function LevelMeter({ level, peak, className }: { level: number; peak?: number; className?: string }) {
  const clip = (peak ?? 0) > 0.98;
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      <div className="h-full rounded-full bg-gradient-to-r from-mint via-mint to-amber-300 transition-[width] duration-75" style={{ width: `${Math.min(100, level * 100)}%` }} />
      {peak !== undefined && <div className={cn("absolute inset-y-0 w-0.5", clip ? "bg-rose-400" : "bg-white/70")} style={{ left: `${Math.min(99.5, peak * 100)}%` }} />}
    </div>
  );
}
