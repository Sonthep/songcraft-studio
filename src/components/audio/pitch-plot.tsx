"use client";

import { useEffect, useRef, useState } from "react";
import type { DetectedNote } from "@/lib/audio/hum";
import { midiToName } from "@/lib/music/theory";

/** Pitch contour (per frame) with detected notes drawn as bars coloured by confidence. */
export function PitchPlot({
  contour,
  notes,
  duration,
  minConfidence = 0,
  height = 220,
  playheadSec,
}: {
  contour: Array<{ time: number; midi: number | null }>;
  notes: DetectedNote[];
  duration: number;
  minConfidence?: number;
  height?: number;
  playheadSec?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(100, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const values = [...contour.map((p) => p.midi).filter((m): m is number => m != null), ...notes.map((n) => n.pitch)];
    if (!values.length || duration <= 0) return;
    const lo = Math.floor(Math.min(...values)) - 2;
    const hi = Math.ceil(Math.max(...values)) + 2;
    const xOf = (t: number) => (t / duration) * width;
    const yOf = (m: number) => height - ((m - lo) / Math.max(1, hi - lo)) * height;
    const rowH = height / Math.max(1, hi - lo);

    // Semitone grid with C labels.
    ctx.font = "10px ui-sans-serif, system-ui";
    for (let m = lo; m <= hi; m++) {
      const y = yOf(m);
      ctx.fillStyle = m % 12 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
      ctx.fillRect(0, y, width, 1);
      if (m % 12 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(midiToName(m), 4, y - 2);
      }
    }
    // Notes.
    for (const n of notes) {
      const pass = n.confidence >= minConfidence;
      const a = 0.25 + 0.65 * n.confidence;
      ctx.fillStyle = pass ? `rgba(110, 231, 200, ${a})` : "rgba(255,255,255,0.12)";
      ctx.fillRect(xOf(n.startSec), yOf(n.pitch) - rowH / 2, Math.max(2, xOf(n.endSec) - xOf(n.startSec)), Math.max(3, rowH * 0.8));
    }
    // Contour line.
    ctx.strokeStyle = "rgba(196, 181, 253, 0.9)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    let pen = false;
    for (const p of contour) {
      if (p.midi == null) {
        pen = false;
        continue;
      }
      const x = xOf(p.time);
      const y = yOf(p.midi);
      if (!pen) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      pen = true;
    }
    ctx.stroke();
  }, [contour, notes, duration, width, height, minConfidence]);

  return (
    <div ref={wrapRef} className="relative w-full rounded-md bg-background/60" style={{ height }} role="img" aria-label="Detected pitch contour and notes">
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
      {playheadSec !== undefined && duration > 0 && <div className="pointer-events-none absolute inset-y-0 w-px bg-playhead" style={{ left: `${(playheadSec / duration) * 100}%` }} />}
    </div>
  );
}
