"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioLines, Gauge, LoaderCircle, Pause, Play, Repeat, Scissors, Upload, AudioWaveform, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, Panel, SimpleSelect } from "@/components/common/form";
import { Waveform } from "./waveform";
import { PitchPlot } from "./pitch-plot";
import { TakeRow } from "@/components/recorder/take-row";
import { useProjectStore } from "@/stores/project-store";
import { decodeBlob, useBlobPlayer } from "@/hooks/use-blob-player";
import { addAudioAsset, loadAudioBlob } from "@/lib/audio/assets";
import { ACCEPTED_AUDIO, MAX_ANALYSIS_SECONDS, sliceAudioBuffer, validateAudioFile, wavBlob } from "@/lib/audio/wav";
import { estimateTempo, type TempoEstimate } from "@/lib/audio/tempo";
import { mixToMono, trackPitch } from "@/lib/audio/pitch";
import { segmentNotes, type SegmentResult } from "@/lib/audio/hum";
import { formatClock } from "@/lib/music/timing";
import type { AudioAsset } from "@/lib/project/schema";

type Filter = "all" | AudioAsset["kind"];

export function AudioWorkspace() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [looping, setLooping] = useState(false);
  const [tempo, setTempo] = useState<TempoEstimate | null | "none">(null);
  const [pitch, setPitch] = useState<{ result: SegmentResult; offset: number; duration: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const player = useBlobPlayer(blob);

  const assets = useMemo(() => [...(project?.audioAssets ?? [])].sort((a, b) => b.createdAt - a.createdAt), [project?.audioAssets]);
  const selected = assets.find((a) => a.id === selectedId) ?? null;

  /** Choose a file and reset the detail view. */
  function select(id: string | null) {
    setBlob(null);
    setBuffer(null);
    setSelection(null);
    setTempo(null);
    setPitch(null);
    setDecodeError(null);
    setSelectedId(id);
  }

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    loadAudioBlob(selectedId).then(async (b) => {
      if (!alive || !b) return;
      setBlob(b);
      try {
        const buf = await decodeBlob(b);
        if (alive) setBuffer(buf);
      } catch {
        if (alive) setDecodeError("This audio could not be decoded for analysis (playback may still work).");
      }
    });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => player.setLoop(looping ? selection : null), [looping, selection, player]);

  if (!project) return null;
  const shown = filter === "all" ? assets : assets.filter((a) => a.kind === filter);

  async function onUpload(file: File) {
    const problem = validateAudioFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      let duration = 0;
      try {
        duration = (await decodeBlob(file)).duration;
      } catch {
        toast.warning("The browser can't decode this file; it is stored but analysis won't work.");
      }
      const a = await addAudioAsset(file, { kind: "reference", name: file.name.replace(/\.[^.]+$/, ""), durationSec: duration, offsetSec: 0, notes: "", mimeType: file.type });
      select(a.id);
      toast.success(`Imported “${file.name}”`);
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function region(): { start: number; end: number } {
    if (selection && selection.end - selection.start > 0.05) return selection;
    return { start: 0, end: buffer?.duration ?? 0 };
  }

  async function saveTrim() {
    if (!buffer || !selected || !selection) return;
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, 1, buffer.sampleRate);
    const clip = sliceAudioBuffer(ctx, buffer, selection.start, selection.end);
    const out = wavBlob(clip);
    const a = await addAudioAsset(out, { kind: selected.kind === "take" ? "take" : "reference", name: `${selected.name} (${formatClock(selection.start)}–${formatClock(selection.end)})`, durationSec: clip.duration, offsetSec: selected.offsetSec + selection.start, notes: `Trimmed from “${selected.name}”`, mimeType: "audio/wav" });
    toast.success("Trimmed clip saved as a new file (original kept)");
    select(a.id);
  }

  function runTempo() {
    if (!buffer) return;
    const { start, end } = region();
    const mono = mixToMono(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
    const s = Math.floor(start * buffer.sampleRate);
    const e = Math.min(mono.length, Math.floor(Math.min(end, start + MAX_ANALYSIS_SECONDS) * buffer.sampleRate));
    setTempo(estimateTempo(mono.subarray(s, e), buffer.sampleRate) ?? "none");
  }

  async function runPitch() {
    if (!buffer) return;
    const { start, end } = region();
    if (end - start > MAX_ANALYSIS_SECONDS) {
      toast.error(`Select a region shorter than ${MAX_ANALYSIS_SECONDS} s for pitch analysis.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const mono = mixToMono(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
      const part = mono.subarray(Math.floor(start * buffer.sampleRate), Math.floor(end * buffer.sampleRate));
      const frames = await trackPitch(part, buffer.sampleRate, {}, setProgress);
      setPitch({ result: segmentNotes(frames), offset: start, duration: end - start });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={AudioLines}
        title="Audio Workspace"
        description="Reference tracks, recordings and renders. Select a region to loop, trim, estimate tempo or analyse vocal pitch."
        actions={
          <>
            <input ref={fileRef} type="file" accept={ACCEPTED_AUDIO} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onUpload(f); }} />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload /> Import audio
            </Button>
          </>
        }
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          {selected && (
            <Panel title={selected.name} actions={<Badge variant="secondary">{selected.kind}</Badge>}>
              {decodeError && <p className="mb-2 text-xs text-amber-200">{decodeError}</p>}
              <div className="flex flex-col gap-3">
                <Waveform buffer={buffer} height={120} playheadSec={player.time} selection={selection} onSelect={setSelection} onSeek={(s) => player.seek(s)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => (player.playing ? player.pause() : void player.play())} disabled={!blob}>
                    {player.playing ? <Pause /> : <Play />} {player.playing ? "Pause" : "Play"}
                  </Button>
                  <Toggle size="sm" pressed={looping} onPressedChange={setLooping} disabled={!selection}>
                    <Repeat /> Loop region
                  </Toggle>
                  <span className="text-xs text-muted-foreground tabular">
                    {formatClock(player.time)} / {formatClock(buffer?.duration ?? selected.durationSec)}
                    {selection && ` · region ${formatClock(selection.start)}–${formatClock(selection.end)} (${(selection.end - selection.start).toFixed(2)} s)`}
                  </span>
                  {selection && (
                    <Button size="xs" variant="ghost" onClick={() => { setSelection(null); setLooping(false); }}>
                      Clear region
                    </Button>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" disabled={!selection || !buffer} onClick={() => void saveTrim()}>
                      <Scissors /> Save region as clip
                    </Button>
                    <Button size="sm" variant="outline" disabled={!buffer} onClick={runTempo}>
                      <Gauge /> Estimate tempo
                    </Button>
                    <Button size="sm" variant="outline" disabled={!buffer || busy} onClick={() => void runPitch()}>
                      {busy ? <LoaderCircle className="animate-spin" /> : <AudioWaveform />} Analyse pitch
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Drag on the waveform to select a region; click to move the playhead. Analysis uses the region, or the whole file if none is selected.</p>
                {progress !== null && <Progress value={progress * 100} aria-label="Pitch analysis progress" />}
                {tempo && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel p-2.5 text-sm">
                    {tempo === "none" ? (
                      <span className="text-muted-foreground">Not enough rhythmic content to estimate a tempo (needs ~4 s with clear onsets).</span>
                    ) : (
                      <>
                        <span>
                          Estimated tempo <span className="font-semibold tabular">{tempo.bpm}</span> BPM
                        </span>
                        <span className="text-xs text-muted-foreground">confidence {Math.round(tempo.confidence * 100)}% · could also be {tempo.alternatives.join(" or ")} BPM</span>
                        <Button size="xs" variant="secondary" className="ml-auto" onClick={() => { update((d) => void (d.bpm = Math.round(tempo.bpm * 2) / 2)); toast.success(`Project tempo set to ${Math.round(tempo.bpm * 2) / 2} BPM`); }}>
                          Use as project tempo
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {pitch && (
                  <div className="flex flex-col gap-2">
                    <PitchPlot contour={pitch.result.contour} notes={pitch.result.notes} duration={pitch.duration} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Info className="size-3.5" /> Voiced {Math.round(pitch.result.voicedRatio * 100)}% · {pitch.result.notes.length} note candidates. Reliable only for solo voice; on full mixes the tracker follows whatever is loudest.
                      <Button size="xs" variant="outline" asChild className="ml-auto">
                        <Link href={`/studio/${project.id}/hum?asset=${selected.id}`}>Convert in Hum to Melody</Link>
                      </Button>
                    </div>
                  </div>
                )}
                <Textarea
                  rows={2}
                  value={selected.notes}
                  maxLength={1000}
                  placeholder="Notes about this file (what to borrow, timestamps, ideas)"
                  onChange={(e) => update((d) => { const a = d.audioAssets.find((x) => x.id === selected.id); if (a) a.notes = e.target.value; }, { history: false, coalesce: `notes-${selected.id}` })}
                  aria-label="Notes"
                />
              </div>
            </Panel>
          )}

          <Panel
            title={`Files (${assets.length})`}
            actions={
              <SimpleSelect
                size="sm"
                className="w-36"
                value={filter}
                onChange={setFilter}
                options={[{ value: "all", label: "All" }, { value: "reference", label: "References" }, { value: "take", label: "Takes" }, { value: "hum", label: "Hums" }, { value: "render", label: "Renders" }]}
                ariaLabel="Filter files"
              />
            }
          >
            {shown.length === 0 ? (
              <EmptyState icon={AudioLines} title="No audio files" action={<Button size="sm" onClick={() => fileRef.current?.click()}><Upload /> Import audio</Button>}>
                Import a reference track (e.g. audio generated in Suno), or record takes in the Vocal Recorder.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown.map((a) => (
                  <TakeRow key={a.id} asset={a} selected={a.id === selectedId} onSelect={() => select(a.id)} />
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-[11px] text-muted-foreground">
            Stem separation and full audio transcription are not built in. The audio pipeline is modular (decode → analyse → notes), so an external separation/transcription service can be added later as a separate adapter.
          </p>
        </div>
      </div>
    </div>
  );
}
