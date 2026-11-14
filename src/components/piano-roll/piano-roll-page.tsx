"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Magnet, MousePointer2, Pencil, Piano, ZoomIn, ZoomOut, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader, SimpleSelect, LabeledSlider } from "@/components/common/form";
import { PianoRoll } from "./piano-roll";
import { MelodyVersions, snapshotMelody } from "./melody-versions";
import { MidiImportButton } from "./midi-import-dialog";
import { useProjectStore } from "@/stores/project-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTransportStore } from "@/stores/transport-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { audioEngine } from "@/lib/audio/engine";
import { seekTo, setLoop } from "@/lib/audio/transport-actions";
import { GRID_OPTIONS, gridById } from "@/lib/music/timing";
import { copyNotes, deleteNotes, duplicateNotes, moveNotes, pasteNotes, quantizeNotes } from "@/lib/music/note-ops";
import { projectLengthTicks } from "@/lib/project/factory";
import { projectToMidi } from "@/lib/midi/midi";
import { downloadBlob, safeFilename } from "@/lib/export/text";
import type { MidiNote } from "@/lib/project/schema";

export function PianoRollPage() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const ed = useEditorStore();
  const pos = useTransportStore((s) => s.positionTicks);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const loop = useTransportStore((s) => s.loop);
  const analysis = useLyricsAnalysis(project?.sections);
  const [qStrength, setQStrength] = useState(1);
  const grid = gridById(ed.gridId);

  const syllableText = useCallback((id: string) => analysis?.tokensById[id]?.text, [analysis]);
  const lengthTicks = useMemo(() => (project ? projectLengthTicks(project) : 0), [project]);

  const commit = useCallback(
    (notes: MidiNote[], opts?: { coalesce?: string }) => update((d) => void (d.notes = notes), opts),
    [update],
  );

  const selectedSet = () => new Set(useEditorStore.getState().selectedNoteIds);
  const notes = () => useProjectStore.getState().project?.notes ?? [];

  useShortcuts([
    { combo: "delete", handler: () => { const s = selectedSet(); if (s.size) { commit(deleteNotes(notes(), s)); ed.setSelection([]); } } },
    { combo: "mod+a", handler: () => ed.setSelection(notes().map((n) => n.id)) },
    { combo: "escape", handler: () => ed.setSelection([]) },
    { combo: "mod+c", handler: () => { const c = copyNotes(notes(), selectedSet()); if (c) { ed.setClipboard(c); toast(`Copied ${c.notes.length} note(s)`); } } },
    { combo: "mod+x", handler: () => { const s = selectedSet(); const c = copyNotes(notes(), s); if (c) { ed.setClipboard(c); commit(deleteNotes(notes(), s)); ed.setSelection([]); } } },
    {
      combo: "mod+v",
      handler: () => {
        const clip = useEditorStore.getState().clipboard;
        if (!clip) return;
        const at = useTransportStore.getState().positionTicks;
        const res = pasteNotes(notes(), clip, Math.round(at / grid.ticks) * grid.ticks);
        commit(res.notes);
        ed.setSelection(res.pastedIds);
      },
    },
    { combo: "mod+d", handler: () => { const res = duplicateNotes(notes(), selectedSet()); if (res.pastedIds.length) { commit(res.notes); ed.setSelection(res.pastedIds); } } },
    { combo: "arrowup", handler: () => commit(moveNotes(notes(), selectedSet(), 0, 1), { coalesce: "nudge" }) },
    { combo: "arrowdown", handler: () => commit(moveNotes(notes(), selectedSet(), 0, -1), { coalesce: "nudge" }) },
    { combo: "shift+arrowup", handler: () => commit(moveNotes(notes(), selectedSet(), 0, 12), { coalesce: "nudge" }) },
    { combo: "shift+arrowdown", handler: () => commit(moveNotes(notes(), selectedSet(), 0, -12), { coalesce: "nudge" }) },
    { combo: "arrowleft", handler: () => commit(moveNotes(notes(), selectedSet(), -grid.ticks, 0), { coalesce: "nudge" }) },
    { combo: "arrowright", handler: () => commit(moveNotes(notes(), selectedSet(), grid.ticks, 0), { coalesce: "nudge" }) },
    { combo: "q", handler: () => quantize() },
    { combo: "b", handler: () => ed.set("tool", "draw") },
    { combo: "v", handler: () => ed.set("tool", "select") },
  ]);

  function quantize() {
    const sel = selectedSet();
    commit(quantizeNotes(notes(), sel.size ? sel : null, { grid: grid.ticks, strength: qStrength, quantizeEnds: true }));
    toast.success(`Quantized ${sel.size || notes().length} note(s) to ${grid.label} at ${Math.round(qStrength * 100)}%`);
  }

  function exportMidi() {
    if (!project) return;
    const bytes = projectToMidi(project, { includeMelody: true, includeChords: true, includeLyrics: true, syllableText });
    downloadBlob(new Blob([new Uint8Array(bytes)], { type: "audio/midi" }), `${safeFilename(project.title)}.mid`);
  }

  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Piano}
        title="Piano Roll"
        description="Click to draw · drag to move · drag the right edge to resize · right-click deletes · Shift/Ctrl-click to multi-select."
        actions={
          <>
            <MidiImportButton />
            <MelodyVersions />
            <Button size="sm" variant="outline" onClick={exportMidi} disabled={!project.notes.length && !project.chords.length}>
              <Download /> Export MIDI
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-panel px-3 py-1.5">
        <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Tool">
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={ed.tool === "draw"} onPressedChange={() => ed.set("tool", "draw")} aria-label="Draw tool">
                <Pencil />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Draw (B)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={ed.tool === "select"} onPressedChange={() => ed.set("tool", "select")} aria-label="Select tool">
                <MousePointer2 />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Select (V)</TooltipContent>
          </Tooltip>
        </div>
        <SimpleSelect size="sm" className="w-24" value={ed.gridId} onChange={(v) => ed.set("gridId", v)} options={GRID_OPTIONS.map((g) => ({ value: g.id, label: g.label }))} ariaLabel="Grid" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle size="sm" pressed={ed.snap} onPressedChange={(v) => ed.set("snap", v)} aria-label="Snap to grid">
              <Magnet />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Snap to grid</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost">Quantize</Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-64 flex-col gap-3">
            <LabeledSlider label="Strength" value={qStrength} onChange={setQStrength} format={(v) => `${Math.round(v * 100)}%`} />
            <p className="text-xs text-muted-foreground">Moves note starts and ends toward the {grid.label} grid. Applies to the selection, or all notes if none are selected. Shortcut: Q.</p>
            <Button size="sm" onClick={quantize} disabled={!project.notes.length}>
              Quantize {ed.selectedNoteIds.length ? "selection" : "all"}
            </Button>
          </PopoverContent>
        </Popover>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => ed.set("zoomX", Math.max(24, Math.round(ed.zoomX / 1.25)))}>
          <ZoomOut />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => ed.set("zoomX", Math.min(480, Math.round(ed.zoomX * 1.25)))}>
          <ZoomIn />
        </Button>
        <SimpleSelect
          size="sm"
          className="w-24"
          value={String(ed.zoomY)}
          onChange={(v) => ed.set("zoomY", Number(v))}
          options={[10, 13, 16, 20, 26].map((h) => ({ value: String(h), label: `Rows ${h}px` }))}
          ariaLabel="Row height"
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <Toggle size="sm" pressed={ed.showChordTones} onPressedChange={(v) => ed.set("showChordTones", v)}>
          Chord tones
        </Toggle>
        <Toggle size="sm" pressed={ed.showLyrics} onPressedChange={(v) => ed.set("showLyrics", v)}>
          Lyrics
        </Toggle>
        <Toggle size="sm" pressed={ed.followPlayhead} onPressedChange={(v) => ed.set("followPlayhead", v)}>
          Follow
        </Toggle>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">{project.notes.length} notes{ed.selectedNoteIds.length ? ` · ${ed.selectedNoteIds.length} selected` : ""}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!project.notes.length}
            onClick={() => {
              snapshotMelody("Before clearing", "manual");
              commit([]);
              ed.setSelection([]);
              toast("Melody cleared (saved as a version first)");
            }}
          >
            <Eraser /> Clear
          </Button>
        </div>
      </div>
      <PianoRoll
        className="min-h-0 flex-1"
        notes={project.notes}
        onChange={commit}
        selectedIds={ed.selectedNoteIds}
        onSelect={ed.setSelection}
        timeSignature={project.timeSignature}
        chords={project.chords}
        keyPc={project.key}
        scale={project.scale}
        vocalRange={project.vocalRange}
        gridTicks={grid.ticks}
        snap={ed.snap}
        tool={ed.tool}
        zoomX={ed.zoomX}
        zoomY={ed.zoomY}
        onZoomX={(z) => ed.set("zoomX", z)}
        showChordTones={ed.showChordTones}
        showLyrics={ed.showLyrics}
        syllableText={syllableText}
        positionTicks={pos}
        isPlaying={isPlaying}
        followPlayhead={ed.followPlayhead}
        onSeek={seekTo}
        loop={loop}
        onLoopChange={setLoop}
        onAudition={(p) => void audioEngine.previewNote(p, 0.25)}
        lengthTicks={lengthTicks}
      />
    </div>
  );
}
