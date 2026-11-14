"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/common/form";
import { parseMidiFile, type ImportedMidi } from "@/lib/midi/midi";
import { useProjectStore } from "@/stores/project-store";
import { snapshotMelody } from "./melody-versions";

export function MidiImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ImportedMidi | null>(null);
  const [track, setTrack] = useState("0");
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [useTempo, setUseTempo] = useState("no");
  const update = useProjectStore((s) => s.update);

  async function onFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("MIDI file too large (limit 5 MB).");
      return;
    }
    try {
      const parsed = parseMidiFile(await file.arrayBuffer());
      if (!parsed.tracks.length) {
        toast.error("This MIDI file contains no notes.");
        return;
      }
      setData(parsed);
      setTrack("0");
    } catch {
      toast.error("Could not read this file as Standard MIDI.");
    }
  }

  function apply() {
    if (!data) return;
    const t = data.tracks[Number(track)];
    if (!t) return;
    snapshotMelody(`Before MIDI import`, "manual");
    update((d) => {
      d.notes = mode === "replace" ? t.notes : [...d.notes, ...t.notes];
      if (useTempo === "yes" && data.bpm) d.bpm = Math.round(Math.max(30, Math.min(300, data.bpm)) * 100) / 100;
    });
    toast.success(`Imported ${t.notes.length} notes from “${t.name}”`);
    setData(null);
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload /> Import MIDI
      </Button>
      <Dialog open={!!data} onOpenChange={(o) => !o && setData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import MIDI</DialogTitle>
            <DialogDescription>
              {data?.name} · {data?.bpm ? `${Math.round(data.bpm * 10) / 10} BPM` : "no tempo"} · {data?.tracks.length} track(s) with notes
            </DialogDescription>
          </DialogHeader>
          {data && (
            <div className="flex flex-col gap-3">
              <Field label="Track">
                <SimpleSelect value={track} onChange={setTrack} options={data.tracks.map((t, i) => ({ value: String(i), label: `${t.name} (${t.noteCount} notes, ch ${t.channel + 1})` }))} />
              </Field>
              <Field label="Mode">
                <SimpleSelect value={mode} onChange={setMode} options={[{ value: "replace", label: "Replace melody" }, { value: "merge", label: "Merge with melody" }]} />
              </Field>
              {data.bpm && (
                <Field label="Tempo">
                  <SimpleSelect value={useTempo} onChange={setUseTempo} options={[{ value: "no", label: "Keep project tempo" }, { value: "yes", label: `Use file tempo (${Math.round(data.bpm * 10) / 10} BPM)` }]} />
                </Field>
              )}
              <p className="text-xs text-muted-foreground">Your current melody is saved as a version first.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setData(null)}>
              Cancel
            </Button>
            <Button onClick={apply}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
