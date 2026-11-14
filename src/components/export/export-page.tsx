"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clipboard, Download, FileMusic, FileText, FileVolume, LoaderCircle, RotateCcw, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, PageHeader, Panel } from "@/components/common/form";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useAIStatus, callAI, AIRequestError } from "@/hooks/use-ai";
import { projectToMidi } from "@/lib/midi/midi";
import { renderOffline } from "@/lib/audio/engine";
import { wavBlob } from "@/lib/audio/wav";
import { exportProject, repository } from "@/lib/persistence/repository";
import {
  defaultSunoDraft,
  downloadBlob,
  formatLyricSheet,
  formatLyricsForSuno,
  formatSunoPrompt,
  formatSunoStyleLine,
  safeFilename,
} from "@/lib/export/text";
import { keyLabel } from "@/lib/music/theory";
import { uid } from "@/lib/project/factory";
import type { SunoDraft } from "@/lib/project/schema";
import type { SunoResponse } from "@/lib/ai/schemas";

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Clipboard is not available — select and copy manually."),
  );
}

export function ExportPage() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const mix = useTransportStore((s) => s.mix);
  const analysis = useLyricsAnalysis(project?.sections);
  const ai = useAIStatus();
  const [opts, setOpts] = useState({ melody: true, chords: true, lyrics: true });
  const [wavBusy, setWavBusy] = useState(false);
  const [refineBusy, setRefineBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [refineNote, setRefineNote] = useState<string | null>(null);

  const draft: SunoDraft | null = project ? (project.suno ?? defaultSunoDraft(project)) : null;
  const syllableText = useCallback((id: string) => analysis?.tokensById[id]?.text, [analysis]);

  // Persist a default draft the first time so edits have something to update.
  useEffect(() => {
    if (project && !project.suno) update((d) => void (d.suno = defaultSunoDraft(project)), { history: false });
  }, [project, update]);

  if (!project || !draft) return null;
  const base = safeFilename(project.title);

  function exportMidi() {
    if (!project) return;
    const bytes = projectToMidi(project, { includeMelody: opts.melody, includeChords: opts.chords, includeLyrics: opts.lyrics, syllableText });
    downloadBlob(new Blob([new Uint8Array(bytes)], { type: "audio/midi" }), `${base}.mid`);
  }

  async function exportWav(saveToProject: boolean) {
    if (!project) return;
    setWavBusy(true);
    try {
      const buf = await renderOffline(
        { bpm: project.bpm, timeSignature: project.timeSignature, notes: opts.melody ? project.notes : [], chords: opts.chords ? project.chords : [] },
        { ...mix, melodyMuted: false, chordsMuted: false },
      );
      const blob = wavBlob(buf);
      if (saveToProject) {
        const id = uid("aud");
        await repository.putAudio(project.id, id, blob);
        update(
          (d) =>
            void d.audioAssets.push({ id, kind: "render", name: `${project.title} (instrument render).wav`, mimeType: "audio/wav", durationSec: buf.duration, sizeBytes: blob.size, createdAt: Date.now(), offsetSec: 0, notes: "" }),
          { history: false },
        );
        toast.success("Render saved to the Audio Workspace");
      } else {
        downloadBlob(blob, `${base} (preview render).wav`);
      }
    } catch (err) {
      toast.error(`Render failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWavBusy(false);
    }
  }

  const setDraft = (patch: Partial<SunoDraft>) => update((d) => void (d.suno = { ...(d.suno ?? draft), ...patch }), { coalesce: "suno" });
  const prompt = formatSunoPrompt(draft);
  const styleLine = formatSunoStyleLine(draft);
  const tagged = formatLyricsForSuno(project.sections);
  const metadata = `${project.title}\nTempo: ${project.bpm} BPM\nKey: ${keyLabel(project.key, project.scale)}\nTime signature: ${project.timeSignature.numerator}/${project.timeSignature.denominator}\nPPQ in exported MIDI: 480\n`;

  async function refine() {
    if (!project || !draft) return;
    setRefineBusy(true);
    setRefineNote(null);
    try {
      const res = await callAI<SunoResponse>("/api/ai/suno", {
        context: { title: project.title, genre: project.genre, mood: project.mood, language: project.language, bpm: project.bpm, key: keyLabel(project.key, project.scale) },
        draft,
        lyricsExcerpt: tagged.slice(0, 4000),
        instruction: instruction.trim() || undefined,
      });
      const { notes, ...fields } = res.result;
      setDraft(fields);
      setRefineNote(notes);
      toast.success("Prompt refined — review and edit before copying (Ctrl+Z to undo)");
    } catch (err) {
      toast.error(err instanceof AIRequestError ? err.message : "Refine failed.");
    } finally {
      setRefineBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Share2} title="Export & Suno" description="Take the song to FL Studio or another DAW, or prepare a prompt for an external generator like Suno." />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Panel title="DAW export (FL Studio, Ableton, Logic…)">
              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><Switch checked={opts.melody} onCheckedChange={(v) => setOpts((o) => ({ ...o, melody: v }))} /> Melody ({project.notes.length})</label>
                <label className="flex items-center gap-2"><Switch checked={opts.chords} onCheckedChange={(v) => setOpts((o) => ({ ...o, chords: v }))} /> Chords ({project.chords.length})</label>
                <label className="flex items-center gap-2"><Switch checked={opts.lyrics} onCheckedChange={(v) => setOpts((o) => ({ ...o, lyrics: v }))} /> Lyric events</label>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel p-2.5">
                  <div className="flex items-start gap-2">
                    <FileMusic className="mt-0.5 size-4 text-mint" />
                    <div>
                      <div className="text-sm">Standard MIDI file (.mid)</div>
                      <div className="text-xs text-muted-foreground">Type 1, 480 PPQ, separate Melody/Chords tracks, tempo, time and key signature.</div>
                    </div>
                  </div>
                  <Button size="sm" onClick={exportMidi} disabled={(!opts.melody || !project.notes.length) && (!opts.chords || !project.chords.length)}>
                    <Download /> MIDI
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel p-2.5">
                  <div className="flex items-start gap-2">
                    <FileVolume className="mt-0.5 size-4 text-mint" />
                    <div>
                      <div className="text-sm">Instrument preview (.wav)</div>
                      <div className="text-xs text-muted-foreground">Offline render of the built-in synths at 44.1 kHz/16-bit — a guide track, not a mix.</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={wavBusy} onClick={() => void exportWav(true)}>Save to project</Button>
                    <Button size="sm" disabled={wavBusy} onClick={() => void exportWav(false)}>
                      {wavBusy ? <LoaderCircle className="animate-spin" /> : <Download />} WAV
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel p-2.5">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 text-mint" />
                    <div>
                      <div className="text-sm">Lyric sheet & metadata (.txt)</div>
                      <div className="text-xs text-muted-foreground">Lyrics with sections, chords, BPM and key.</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copy(metadata, "BPM/key metadata")}>
                      <Clipboard /> Metadata
                    </Button>
                    <Button size="sm" onClick={() => downloadBlob(new Blob([formatLyricSheet(project)], { type: "text/plain;charset=utf-8" }), `${base} - lyrics.txt`)}>
                      <Download /> Lyrics
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel p-2.5">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 text-violet" />
                    <div>
                      <div className="text-sm">SongCraft project (.json)</div>
                      <div className="text-xs text-muted-foreground">Backup or move to another browser. Audio recordings are not included.</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify(exportProject(project), null, 2)], { type: "application/json" }), `${base}.songcraft.json`)}>
                    <Download /> JSON
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                FL Studio: drag the .mid into the Playlist or Channel Rack and set the project tempo to {project.bpm} BPM. There is no direct .flp project export — MIDI, WAV and text files are the supported hand-off. Recordings can be downloaded from the{" "}
                <Link href={`/studio/${project.id}/audio`} className="text-mint hover:underline">Audio Workspace</Link>.
              </p>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel
              title="Suno prompt"
              actions={
                <Button size="xs" variant="ghost" onClick={() => update((d) => void (d.suno = defaultSunoDraft(project)))}>
                  <RotateCcw /> Reset from song
                </Button>
              }
            >
              <p className="mb-3 text-xs text-muted-foreground">
                Suno is an external service: copy these into its custom-mode fields yourself, then import the generated audio into the{" "}
                <Link href={`/studio/${project.id}/audio`} className="text-mint hover:underline">Audio Workspace</Link>. No automation or unofficial API is used.
              </p>
              <div className="grid gap-2">
                {(
                  [
                    ["genre", "Genre"],
                    ["mood", "Mood"],
                    ["tempo", "Tempo"],
                    ["vocals", "Vocals"],
                    ["arrangement", "Arrangement"],
                    ["extra", "Extra (optional)"],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    {k === "vocals" || k === "arrangement" || k === "extra" ? (
                      <Textarea rows={2} value={draft[k]} maxLength={600} onChange={(e) => setDraft({ [k]: e.target.value })} />
                    ) : (
                      <Input value={draft[k]} maxLength={400} onChange={(e) => setDraft({ [k]: e.target.value })} />
                    )}
                  </Field>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-panel p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Formatted prompt</span>
                  <span className="text-[11px] text-muted-foreground">{prompt.length} chars</span>
                </div>
                <pre className="text-xs whitespace-pre-wrap">{prompt}</pre>
                <div className="flex flex-wrap gap-1">
                  <Button size="xs" onClick={() => copy(prompt, "Prompt")}><Clipboard /> Copy prompt</Button>
                  <Button size="xs" variant="outline" onClick={() => copy(styleLine, "Style line")}><Clipboard /> Copy as one line ({styleLine.length} chars)</Button>
                  <Button size="xs" variant="outline" onClick={() => copy(tagged, "Tagged lyrics")}><Clipboard /> Copy tagged lyrics</Button>
                </div>
              </div>
              {ai?.configured && (
              <div className="mt-3 flex flex-col gap-2">
                <Field label="Refine with AI (optional)" hint={ai && !ai.configured ? ai.reason : "The assistant rewrites the fields above; review before copying."}>
                  <div className="flex gap-2">
                    <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={600} placeholder="e.g. more lo-fi, female vocal, add Thai phin texture" disabled={!ai?.configured} />
                    <Button onClick={() => void refine()} disabled={refineBusy || !ai?.configured}>
                      {refineBusy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Refine
                    </Button>
                  </div>
                </Field>
                {refineNote && <p className="rounded-md bg-violet/10 p-2 text-xs text-muted-foreground">{refineNote}</p>}
              </div>
              )}
            </Panel>
            <Panel title="Tagged lyrics preview">
              <pre className="scrollbar-thin max-h-72 overflow-y-auto text-xs whitespace-pre-wrap text-muted-foreground">{tagged || "(no lyrics yet)"}</pre>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
