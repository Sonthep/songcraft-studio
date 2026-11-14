"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChordEvent, MidiNote } from "@/lib/project/schema";
import { PPQ, snapTick, ticksPerBar, ticksPerBeat, type TimeSignature } from "@/lib/music/timing";
import { chordPitchClasses, midiToName, mod12, scalePitchClasses, type ScaleName } from "@/lib/music/theory";
import { addNote, moveNotes, notesInRect, resizeNotes } from "@/lib/music/note-ops";

export const TOP_PITCH = 108; // C8
export const BOTTOM_PITCH = 24; // C1
const ROWS = TOP_PITCH - BOTTOM_PITCH + 1;
const KEYS_W = 56;
const RULER_H = 22;
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export interface PianoRollProps {
  notes: MidiNote[];
  /** Commit a new note list (one undo step unless `coalesce` matches the previous commit). */
  onChange?: (notes: MidiNote[], opts?: { coalesce?: string }) => void;
  selectedIds: string[];
  onSelect?: (ids: string[]) => void;
  timeSignature: TimeSignature;
  chords?: ChordEvent[];
  keyPc?: number;
  scale?: ScaleName;
  vocalRange?: { low: number; high: number };
  gridTicks: number;
  snap: boolean;
  tool: "draw" | "select";
  zoomX: number; // px per quarter
  zoomY: number; // px per row
  showChordTones?: boolean;
  showLyrics?: boolean;
  syllableText?: (id: string) => string | undefined;
  positionTicks?: number;
  isPlaying?: boolean;
  followPlayhead?: boolean;
  onSeek?: (tick: number) => void;
  loop?: { enabled: boolean; start: number; end: number };
  onLoopChange?: (loop: { enabled: boolean; start: number; end: number }) => void;
  onAudition?: (pitch: number) => void;
  onZoomX?: (z: number) => void;
  lengthTicks: number;
  readOnly?: boolean;
  /** Extra notes drawn faintly for reference (e.g. original melody when comparing). */
  ghostNotes?: MidiNote[];
  className?: string;
  showVelocity?: boolean;
}

type Drag =
  | { kind: "move"; ids: Set<string>; x0: number; y0: number; anchorStart: number; dTick: number; dPitch: number; moved: boolean; coalesce?: string }
  | { kind: "resize"; ids: Set<string>; x0: number; anchorEnd: number; dTicks: number; coalesce?: string }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; additive: boolean; base: string[] }
  | { kind: "loop"; t0: number; t1: number }
  | { kind: "velocity"; ids: Set<string>; value: number };

function rowBackground(rowH: number, scalePcs: Set<number> | null): string {
  // Rows run from TOP_PITCH (a C) downwards, so the 12-row pattern starts at pc 0 and descends.
  const stops: string[] = [];
  for (let i = 0; i < 12; i++) {
    const pc = mod12(TOP_PITCH - i);
    let color = "transparent";
    if (BLACK_PCS.has(pc)) color = "var(--row-black)";
    if (scalePcs && !scalePcs.has(pc)) color = "oklch(0 0 0 / 28%)";
    const line = pc === 0 ? "oklch(1 0 0 / 10%)" : "oklch(1 0 0 / 4%)";
    stops.push(`${color} ${i * rowH}px`, `${color} ${(i + 1) * rowH - 1}px`, `${line} ${(i + 1) * rowH - 1}px`, `${line} ${(i + 1) * rowH}px`);
  }
  return `repeating-linear-gradient(to bottom, ${stops.join(", ")})`;
}

function columnBackground(pxPerTick: number, ts: TimeSignature, gridTicks: number): string {
  const bar = ticksPerBar(ts) * pxPerTick;
  const beat = ticksPerBeat(ts) * pxPerTick;
  const grid = gridTicks * pxPerTick;
  const layers = [`repeating-linear-gradient(to right, var(--grid-bar) 0 1px, transparent 1px ${bar}px)`];
  if (beat >= 6) layers.push(`repeating-linear-gradient(to right, var(--grid-beat) 0 1px, transparent 1px ${beat}px)`);
  if (grid >= 5 && grid < beat) layers.push(`repeating-linear-gradient(to right, var(--grid-sub) 0 1px, transparent 1px ${grid}px)`);
  return layers.join(", ");
}

export function PianoRoll(props: PianoRollProps) {
  const {
    notes, onChange, selectedIds, onSelect, timeSignature: ts, chords = [], keyPc, scale, vocalRange, gridTicks, snap, tool,
    zoomX, zoomY, showChordTones = true, showLyrics = true, syllableText, positionTicks = 0, isPlaying, followPlayhead,
    onSeek, loop, onLoopChange, onAudition, onZoomX, lengthTicks, readOnly, ghostNotes, className, showVelocity = true,
  } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const lastLength = useRef(PPQ / 2);
  const lastAudition = useRef<number | null>(null);

  const pxPerTick = zoomX / PPQ;
  const rowH = zoomY;
  const bar = ticksPerBar(ts);
  const totalTicks = Math.max(lengthTicks + bar * 4, bar * 16);
  const width = totalTicks * pxPerTick;
  const height = ROWS * rowH;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const scalePcs = useMemo(() => (keyPc !== undefined && scale ? new Set(scalePitchClasses(keyPc, scale)) : null), [keyPc, scale]);

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const tickAt = useCallback((clientX: number) => {
    const rect = contentRef.current!.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / pxPerTick);
  }, [pxPerTick]);
  const pitchAt = useCallback((clientY: number) => {
    const rect = contentRef.current!.getBoundingClientRect();
    const row = Math.floor((clientY - rect.top) / rowH);
    return Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - row));
  }, [rowH]);
  const snapT = useCallback((t: number, mode: "round" | "floor" | "ceil" = "round") => (snap ? snapTick(t, gridTicks, mode) : Math.round(t)), [snap, gridTicks]);

  // Initial scroll: centre on existing notes or the vocal range.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ps = notes.length ? notes.map((n) => n.pitch) : vocalRange ? [vocalRange.low, vocalRange.high] : [60, 72];
    const mid = (Math.min(...ps) + Math.max(...ps)) / 2;
    el.scrollTop = Math.max(0, (TOP_PITCH - mid) * rowH - el.clientHeight / 2 + RULER_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow playhead.
  useEffect(() => {
    if (!followPlayhead || !isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = positionTicks * pxPerTick;
    const visibleW = el.clientWidth - KEYS_W;
    if (x < el.scrollLeft || x > el.scrollLeft + visibleW - 40) el.scrollLeft = Math.max(0, x - 40);
  }, [positionTicks, followPlayhead, isPlaying, pxPerTick]);

  // Keep velocity lane horizontally in sync.
  const onScroll = () => {
    if (velRef.current && scrollRef.current) velRef.current.scrollLeft = scrollRef.current.scrollLeft;
  };

  // Ctrl/Cmd + wheel zooms horizontally.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onZoomX) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const next = Math.max(24, Math.min(480, zoomX * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      onZoomX(Math.round(next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomX, onZoomX]);

  const audition = (pitch: number) => {
    if (lastAudition.current === pitch) return;
    lastAudition.current = pitch;
    onAudition?.(pitch);
  };

  /* ---------------- pointer handling on the note grid ---------------- */

  function onGridPointerDown(e: React.PointerEvent) {
    if (e.button === 2 || readOnly) return;
    const target = e.target as HTMLElement;
    const noteEl = target.closest<HTMLElement>("[data-note-id]");
    contentRef.current!.setPointerCapture(e.pointerId);
    lastAudition.current = null;

    if (noteEl) {
      const id = noteEl.dataset.noteId!;
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      let ids: Set<string>;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        ids = new Set(selected);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        onSelect?.([...ids]);
        if (!ids.has(id)) return;
      } else if (selected.has(id)) {
        ids = new Set(selected);
      } else {
        ids = new Set([id]);
        onSelect?.([id]);
      }
      const rect = noteEl.getBoundingClientRect();
      const nearRightEdge = e.clientX > rect.right - Math.min(8, rect.width / 3);
      if (nearRightEdge) {
        setDragBoth({ kind: "resize", ids, x0: e.clientX, anchorEnd: note.startTick + note.durationTicks, dTicks: 0 });
      } else {
        setDragBoth({ kind: "move", ids, x0: e.clientX, y0: e.clientY, anchorStart: note.startTick, dTick: 0, dPitch: 0, moved: false });
        audition(note.pitch);
      }
      return;
    }

    if (tool === "draw" && !e.shiftKey) {
      const start = snapT(tickAt(e.clientX), "floor");
      const pitch = pitchAt(e.clientY);
      const res = addNote(notes, { pitch, startTick: start, durationTicks: Math.max(snap ? gridTicks : 10, lastLength.current), velocity: 96, syllableId: null });
      const coalesce = `create-${res.note.id}`;
      onChange?.(res.notes, { coalesce });
      onSelect?.([res.note.id]);
      audition(pitch);
      setDragBoth({ kind: "resize", ids: new Set([res.note.id]), x0: e.clientX, anchorEnd: res.note.startTick + res.note.durationTicks, dTicks: 0, coalesce });
      return;
    }

    const rect = contentRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) onSelect?.([]);
    setDragBoth({ kind: "marquee", x0: x, y0: y, x1: x, y1: y, additive, base: additive ? selectedIds : [] });
  }

  function onGridPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "move") {
      const rawDt = (e.clientX - d.x0) / pxPerTick;
      const newStart = snapT(d.anchorStart + rawDt);
      const dTick = newStart - d.anchorStart;
      const dPitch = Math.round(-(e.clientY - d.y0) / rowH);
      const moved = d.moved || Math.abs(e.clientX - d.x0) > 3 || Math.abs(e.clientY - d.y0) > 3;
      if (dTick !== d.dTick || dPitch !== d.dPitch || moved !== d.moved) {
        setDragBoth({ ...d, dTick, dPitch, moved });
        const anchor = notes.find((n) => d.ids.has(n.id));
        if (anchor && dPitch !== d.dPitch) audition(anchor.pitch + dPitch);
      }
    } else if (d.kind === "resize") {
      const rawDt = (e.clientX - d.x0) / pxPerTick;
      const newEnd = snapT(d.anchorEnd + rawDt);
      const dTicks = newEnd - d.anchorEnd;
      if (dTicks !== d.dTicks) setDragBoth({ ...d, dTicks });
    } else if (d.kind === "marquee") {
      const rect = contentRef.current!.getBoundingClientRect();
      setDragBoth({ ...d, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
    }
  }

  function onGridPointerUp() {
    const d = dragRef.current;
    if (!d) return;
    setDragBoth(null);
    if (d.kind === "move" && d.moved && (d.dTick !== 0 || d.dPitch !== 0)) {
      onChange?.(moveNotes(notes, d.ids, d.dTick, d.dPitch), d.coalesce ? { coalesce: d.coalesce } : undefined);
    } else if (d.kind === "resize" && d.dTicks !== 0) {
      const minDur = snap ? gridTicks : 10;
      const next = resizeNotes(notes, d.ids, d.dTicks, minDur);
      const changed = next.find((n) => d.ids.has(n.id));
      if (changed) lastLength.current = changed.durationTicks;
      onChange?.(next, d.coalesce ? { coalesce: d.coalesce } : undefined);
    } else if (d.kind === "resize") {
      const n = notes.find((x) => d.ids.has(x.id));
      if (n) lastLength.current = n.durationTicks;
    } else if (d.kind === "marquee") {
      const t0 = Math.min(d.x0, d.x1) / pxPerTick;
      const t1 = Math.max(d.x0, d.x1) / pxPerTick;
      const p0 = TOP_PITCH - Math.floor(Math.max(d.y0, d.y1) / rowH);
      const p1 = TOP_PITCH - Math.floor(Math.min(d.y0, d.y1) / rowH);
      const hit = notesInRect(notes, { tickStart: t0, tickEnd: t1, pitchLow: p0, pitchHigh: p1 });
      onSelect?.(Array.from(new Set([...d.base, ...hit])));
    }
  }

  function onNoteContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    if (readOnly) return;
    const ids = selected.has(id) ? selected : new Set([id]);
    onChange?.(notes.filter((n) => !ids.has(n.id)));
    onSelect?.([]);
  }

  /* ---------------- ruler: click to seek, drag to set loop ---------------- */

  function onRulerPointerDown(e: React.PointerEvent) {
    const rect = contentRef.current!.getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / pxPerTick);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragBoth({ kind: "loop", t0: snapTick(t, ticksPerBeat(ts), "floor"), t1: snapTick(t, ticksPerBeat(ts), "floor") });
  }
  function onRulerPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d?.kind !== "loop") return;
    const rect = contentRef.current!.getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / pxPerTick);
    setDragBoth({ ...d, t1: snapTick(t, ticksPerBeat(ts), "ceil") });
  }
  function onRulerPointerUp() {
    const d = dragRef.current;
    setDragBoth(null);
    if (d?.kind !== "loop") return;
    if (Math.abs(d.t1 - d.t0) < ticksPerBeat(ts)) {
      onSeek?.(d.t0);
    } else if (onLoopChange) {
      onLoopChange({ enabled: true, start: Math.min(d.t0, d.t1), end: Math.max(d.t0, d.t1) });
    }
  }

  /* ---------------- velocity lane ---------------- */

  function onVelPointerDown(e: React.PointerEvent, note: MidiNote) {
    if (readOnly) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const ids = selected.has(note.id) ? new Set(selected) : new Set([note.id]);
    const value = velocityFromEvent(e);
    setDragBoth({ kind: "velocity", ids, value });
  }
  function velocityFromEvent(e: React.PointerEvent) {
    const lane = (e.currentTarget as HTMLElement).closest("[data-vel-lane]") as HTMLElement;
    const rect = lane.getBoundingClientRect();
    return Math.max(1, Math.min(127, Math.round(((rect.bottom - e.clientY) / rect.height) * 127)));
  }
  function onVelPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d?.kind !== "velocity") return;
    setDragBoth({ ...d, value: velocityFromEvent(e) });
  }
  function onVelPointerUp() {
    const d = dragRef.current;
    setDragBoth(null);
    if (d?.kind !== "velocity") return;
    onChange?.(notes.map((n) => (d.ids.has(n.id) ? { ...n, velocity: d.value } : n)));
  }

  /* ---------------- derived render data ---------------- */

  const viewNotes = useMemo(() => {
    if (!drag || (drag.kind !== "move" && drag.kind !== "resize" && drag.kind !== "velocity")) return notes;
    if (drag.kind === "move") return drag.moved ? moveNotes(notes, drag.ids, drag.dTick, drag.dPitch) : notes;
    if (drag.kind === "resize") return resizeNotes(notes, drag.ids, drag.dTicks, snap ? gridTicks : 10);
    return notes.map((n) => (drag.ids.has(n.id) ? { ...n, velocity: drag.value } : n));
  }, [notes, drag, snap, gridTicks]);

  const chordBands = useMemo(() => {
    if (!showChordTones || !chords.length) return [];
    const out: Array<{ key: string; left: number; width: number; top: number }> = [];
    for (const c of chords) {
      const pcs = new Set(chordPitchClasses({ root: c.root, quality: c.quality, bass: c.bass }));
      for (let p = BOTTOM_PITCH; p <= TOP_PITCH; p++) {
        if (!pcs.has(mod12(p))) continue;
        if (vocalRange && (p < vocalRange.low - 5 || p > vocalRange.high + 5)) continue;
        out.push({ key: `${c.id}-${p}`, left: c.startTick * pxPerTick, width: c.durationTicks * pxPerTick, top: (TOP_PITCH - p) * rowH });
      }
    }
    return out;
  }, [showChordTones, chords, vocalRange, pxPerTick, rowH]);

  const barCount = Math.ceil(totalTicks / bar);
  const marquee = drag?.kind === "marquee" ? drag : null;
  const loopPreview = drag?.kind === "loop" ? { start: Math.min(drag.t0, drag.t1), end: Math.max(drag.t0, drag.t1) } : null;
  const loopShown = loopPreview ?? (loop?.enabled ? loop : null);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-auto bg-background select-none"
        role="application"
        aria-label="Piano roll note editor"
      >
        <div className="relative" style={{ width: width + KEYS_W, height: height + RULER_H }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-panel"
            style={{ height: RULER_H, width: width + KEYS_W }}
          >
            <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-panel" style={{ width: KEYS_W }} />
            <div
              className="relative cursor-pointer"
              style={{ width }}
              onPointerDown={onRulerPointerDown}
              onPointerMove={onRulerPointerMove}
              onPointerUp={onRulerPointerUp}
              title="Click to move the playhead · drag to set a loop region"
            >
              {loopShown && (
                <div className="absolute inset-y-0 bg-mint/15 border-x border-mint/60" style={{ left: loopShown.start * pxPerTick, width: (loopShown.end - loopShown.start) * pxPerTick }} />
              )}
              {Array.from({ length: barCount }, (_, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-white/15 pl-1 text-[10px] leading-[22px] text-muted-foreground tabular" style={{ left: i * bar * pxPerTick }}>
                  {bar * pxPerTick > 22 || i % 4 === 0 ? i + 1 : ""}
                </div>
              ))}
              <div className="pointer-events-none absolute top-0 h-full w-px bg-playhead" style={{ left: positionTicks * pxPerTick }} />
            </div>
          </div>

          <div className="flex">
            {/* Keyboard */}
            <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-panel" style={{ width: KEYS_W, height }}>
              {Array.from({ length: ROWS }, (_, r) => {
                const p = TOP_PITCH - r;
                const black = BLACK_PCS.has(mod12(p));
                const inRange = vocalRange && p >= vocalRange.low && p <= vocalRange.high;
                return (
                  <button
                    key={p}
                    type="button"
                    tabIndex={-1}
                    onPointerDown={() => onAudition?.(p)}
                    className={cn(
                      "absolute right-0 flex items-center justify-end border-b border-black/30 pr-1 text-[9px] leading-none",
                      black ? "w-[62%] bg-[var(--key-black)] text-white/40" : "w-full bg-[var(--key-white)] text-black/50",
                    )}
                    style={{ top: r * rowH, height: rowH }}
                    aria-label={midiToName(p)}
                  >
                    {inRange && <span className="absolute top-0 left-0 h-full w-1 bg-mint/70" aria-hidden />}
                    {mod12(p) === 0 && rowH >= 10 ? midiToName(p) : ""}
                  </button>
                );
              })}
            </div>

            {/* Grid + notes */}
            <div
              ref={contentRef}
              className={cn("relative", tool === "draw" ? "cursor-crosshair" : "cursor-default")}
              style={{
                width,
                height,
                backgroundImage: `${columnBackground(pxPerTick, ts, gridTicks)}, ${rowBackground(rowH, scalePcs)}`,
              }}
              onPointerDown={onGridPointerDown}
              onPointerMove={onGridPointerMove}
              onPointerUp={onGridPointerUp}
              onPointerCancel={onGridPointerUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              {vocalRange && (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/20" style={{ height: (TOP_PITCH - vocalRange.high) * rowH }} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/20" style={{ top: (TOP_PITCH - vocalRange.low + 1) * rowH }} />
                </>
              )}
              {chordBands.map((b) => (
                <div key={b.key} className="pointer-events-none absolute bg-violet/12" style={{ left: b.left, width: b.width, top: b.top, height: rowH }} />
              ))}
              {loopShown && (
                <div className="pointer-events-none absolute inset-y-0 bg-mint/5" style={{ left: loopShown.start * pxPerTick, width: (loopShown.end - loopShown.start) * pxPerTick }} />
              )}
              {ghostNotes?.map((n) => (
                <div
                  key={`ghost-${n.id}`}
                  className="pointer-events-none absolute rounded-[3px] border border-dashed border-white/25"
                  style={{ left: n.startTick * pxPerTick, top: (TOP_PITCH - n.pitch) * rowH, width: Math.max(3, n.durationTicks * pxPerTick), height: rowH }}
                />
              ))}
              {viewNotes.map((n) => {
                if (n.pitch > TOP_PITCH || n.pitch < BOTTOM_PITCH) return null;
                const isSel = selected.has(n.id);
                const w = Math.max(4, n.durationTicks * pxPerTick - 1);
                const label = showLyrics && n.syllableId ? syllableText?.(n.syllableId) : undefined;
                const outOfScale = scalePcs && !scalePcs.has(mod12(n.pitch));
                return (
                  <div
                    key={n.id}
                    data-note-id={n.id}
                    onContextMenu={(e) => onNoteContextMenu(e, n.id)}
                    title={`${midiToName(n.pitch)} · vel ${n.velocity}${label ? ` · “${label}”` : ""}`}
                    className={cn(
                      "absolute overflow-hidden rounded-[3px] border text-[10px] leading-none whitespace-nowrap",
                      isSel ? "border-white bg-mint text-primary-foreground" : "border-black/40 text-primary-foreground",
                      readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                      outOfScale && !isSel && "ring-1 ring-amber-300/70",
                    )}
                    style={{
                      left: n.startTick * pxPerTick,
                      top: (TOP_PITCH - n.pitch) * rowH,
                      width: w,
                      height: rowH,
                      background: isSel ? undefined : `color-mix(in oklch, var(--mint) ${45 + (n.velocity / 127) * 55}%, var(--background))`,
                    }}
                  >
                    {label && rowH >= 11 && <span className="pointer-events-none px-1 font-medium" style={{ lineHeight: `${rowH - 2}px` }}>{label}</span>}
                    {!readOnly && <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" aria-hidden />}
                  </div>
                );
              })}
              {marquee && (
                <div
                  className="pointer-events-none absolute border border-mint bg-mint/10"
                  style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
                />
              )}
              <div className="pointer-events-none absolute inset-y-0 w-px bg-playhead shadow-[0_0_6px_var(--playhead)]" style={{ left: positionTicks * pxPerTick }} />
            </div>
          </div>
        </div>
      </div>

      {showVelocity && (
        <div className="flex h-16 shrink-0 border-t border-border bg-panel">
          <div className="flex shrink-0 items-center justify-center border-r border-border text-[10px] text-muted-foreground" style={{ width: KEYS_W }}>
            Velocity
          </div>
          <div ref={velRef} className="relative flex-1 overflow-hidden" data-vel-lane>
            <div className="relative h-full" style={{ width }} onPointerMove={onVelPointerMove} onPointerUp={onVelPointerUp} onPointerCancel={onVelPointerUp}>
              {viewNotes.map((n) => (
                <div
                  key={n.id}
                  onPointerDown={(e) => onVelPointerDown(e, n)}
                  className={cn("absolute bottom-0 w-[5px] cursor-ns-resize rounded-t-sm", selected.has(n.id) ? "bg-mint" : "bg-mint/50")}
                  style={{ left: n.startTick * pxPerTick, height: `${(n.velocity / 127) * 100}%` }}
                  title={`Velocity ${n.velocity} — drag to change`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
