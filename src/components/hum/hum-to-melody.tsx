"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AudioWaveform, Circle, LoaderCircle, Pause, Play, Square, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Field, LabeledSlider, PageHeader, Panel, SimpleSelect } from "@/components/common/form";
import { LevelMeter, Waveform } from "@/components/audio/waveform";
import { PitchPlot } from "@/components/audio/pitch-plot";
import { snapshotMelody } from "@/components/piano-roll/melody-versions";
import { useProjectStore } from "@/stores/project-store";
import { useRecorder } from "@/hooks/use-recorder";
import { decodeBlob, useBlobPlayer } from "@/hooks/use-blob-player";
import { mixToMono, trackPitch, type PitchFrame } from "@/lib/audio/pitch";
import { DEFAULT_SEGMENT_OPTIONS, detectedToMidiNotes, segmentNotes } from "@/lib/audio/hum";
import { ACCEPTED_AUDIO, MAX_ANALYSIS_SECONDS, validateAudioFile } from "@/lib/audio/wav";
import { GRID_OPTIONS, gridById, ticksPerBar, formatClock } from "@/lib/music/timing";
import { midiToName } from "@/lib/music/theory";
import { repository } from "@/lib/persistence/repository";
import { uid } from "@/lib/project/factory";
import { loadAudioBlob } from "@/lib/audio/assets";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function HumToMelody() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const rec = useRecorder({ maxSeconds: MAX_ANALYSIS_SECONDS, noiseSuppression: true });
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobName, setBlobName] = useState("");
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [frames, setFrames] = useState<PitchFrame[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const player = useBlobPlayer(blob);
  const fileRef = useRef<HTMLInputElement>(null);

  // Analysis settings.
  const [sensitivity, setSensitivity] = useState(0.5);
  const [noiseGate, setNoiseGate] = useState(DEFAULT_SEGMENT_OPTIONS.noiseGateDb);
  const [minNoteMs, setMinNoteMs] = useState(DEFAULT_SEGMENT_OPTIONS.minNoteMs);
  const [split, setSplit] = useState(DEFAULT_SEGMENT_OPTIONS.splitSemitones);
  const [octaveFix, setOctaveFix] = useState(true);
  const [onsets, setOnsets] = useState(true);
  // Conversion settings.
  const [gridId, setGridId] = useState("1/16");
  const [qStrength, setQStrength] = useState(0.75);
  const [tempo, setTempo] = useState<number | null>(null);
  const [transpose, setTranspose] = useState("0");
  const [minConf, setMinConf] = useState(0.35);
  const [startBar, setStartBar] = useState("1");
  const [mode, setMode] = useState<"replace" | "merge">("merge");
  const [keepAudio, setKeepAudio] = useState(true);

  const bpm = tempo ?? project?.bpm ?? 90;
  const yinThreshold = 0.08 + sensitivity * 0.27; // stricter (0.08) … permissive (0.35)
  const minClarity = 0.8 - sensitivity * 0.45;

  useEffect(() => () => abortRef.current?.abort(), []);

  // Hand-off from the Audio Workspace: /hum?asset=<id>
  const searchParams = useSearchParams();
  const assetParam = searchParams.get("asset");
  const handedOff = useRef<string | null>(null);
  useEffect(() => {
    if (!assetParam || handedOff.current === assetParam) return;
    handedOff.current = assetParam;
    const meta = useProjectStore.getState().project?.audioAssets.find((a) => a.id === assetParam);
    void loadAudioBlob(assetParam).then((b) => {
      if (b) void loadBlob(b, meta?.name ?? "Audio file");
      else toast.error("That audio file is no longer available.");
    });
  }, [assetParam]);

  async function loadBlob(b: Blob, name: string) {
    abortRef.current?.abort();
    setError(null);
    setFrames(null);
    setBlob(b);
    setBlobName(name);
    try {
      const buf = await decodeBlob(b);
      if (buf.duration > MAX_ANALYSIS_SECONDS) {
        setError(`Audio is ${Math.round(buf.duration)} s long. Analysis is limited to ${MAX_ANALYSIS_SECONDS} s — trim it in the Audio Workspace first.`);
      }
      setBuffer(buf);
    } catch {
      setBuffer(null);
      setError("This file could not be decoded by the browser. Try WAV or MP3.");
    }
  }

  async function analyze() {
    if (!buffer) return;
    if (buffer.duration > MAX_ANALYSIS_SECONDS) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress(0);
    setError(null);
    try {
      const mono = mixToMono(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
      const f = await trackPitch(mono, buffer.sampleRate, { threshold: yinThreshold }, setProgress, ctrl.signal);
      setFrames(f);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(`Analysis failed: ${(err as Error).message}`);
    } finally {
      setProgress(null);
    }
  }

  // Re-segmentation is cheap, so it updates live as settings change.
  const result = useMemo(
    () =>
      frames
        ? segmentNotes(frames, { noiseGateDb: noiseGate, minClarity, minNoteMs, splitSemitones: split, octaveCorrection: octaveFix, splitOnOnsets: onsets })
        : null,
    [frames, noiseGate, minClarity, minNoteMs, split, octaveFix, onsets],
  );

  if (!project) return null;
  const bar = ticksPerBar(project.timeSignature);
  const grid = gridById(gridId);
  const accepted = result?.notes.filter((n) => n.confidence >= minConf) ?? [];

  async function sendToPianoRoll() {
    if (!project || !result) return;
    const startTick = (Number(startBar) - 1) * bar;
    const firstOnset = accepted[0]?.startSec ?? 0;
    const notes = detectedToMidiNotes(result.notes, {
      bpm,
      offsetSec: firstOnset,
      startTick,
      gridTicks: grid.ticks,
      quantizeStrength: qStrength,
      transpose: Number(transpose),
      minConfidence: minConf,
    });
    if (!notes.length) {
      toast.error("No notes pass the confidence threshold.");
      return;
    }
    snapshotMelody("Before hum import", "manual");
    update((d) => {
      d.notes = mode === "replace" ? notes : [...d.notes, ...notes];
    });
    snapshotMelody(`Hum: ${blobName || "recording"}`, "hum");
    if (keepAudio && blob && buffer && !assetParam) {
      try {
        const id = uid("aud");
        await repository.putAudio(project.id, id, blob);
        update(
          (d) =>
            void d.audioAssets.push({ id, kind: "hum", name: blobName || `Hum ${new Date().toLocaleTimeString()}`, mimeType: blob.type || "audio/webm", durationSec: buffer.duration, sizeBytes: blob.size, createdAt: Date.now(), offsetSec: 0, notes: "Used for Hum to Melody" }),
          { history: false },
        );
      } catch {
        toast.error("Notes were added, but the audio could not be saved.");
      }
    }
    toast.success(`${notes.length} notes added to the melody`);
    router.push(`/studio/${project.id}/piano-roll`);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={AudioWaveform}
        title="Hum to Melody"
        description="Hum or sing one clean melody line; pitch is tracked with the YIN algorithm and split into editable notes. Monophonic input only — mixed or polyphonic audio won't transcribe reliably."
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <Panel title="1 · Source">
            <div className="flex flex-wrap items-center gap-2">
              {rec.state === "recording" ? (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    const b = await rec.stop();
                    rec.close();
                    if (b) await loadBlob(b, `Hum ${new Date().toLocaleTimeString()}`);
                  }}
                >
                  <Square /> Stop ({formatClock(rec.elapsed)})
                </Button>
              ) : (
                <Button onClick={() => void rec.start()} disabled={!rec.supported || rec.state === "requesting"}>
                  <Circle className="fill-rose-400 text-rose-400" /> {rec.state === "requesting" ? "Waiting for permission…" : "Record humming"}
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_AUDIO}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const problem = validateAudioFile(f);
                  if (problem) {
                    toast.error(problem);
                    return;
                  }
                  void loadBlob(f, f.name);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={rec.state === "recording"}>
                <Upload /> Upload audio
              </Button>
              {(rec.state === "recording" || rec.state === "ready") && <LevelMeter level={rec.level} peak={rec.peak} className="max-w-xs" />}
              {blob && (
                <span className="text-xs text-muted-foreground">
                  {blobName} · {buffer ? `${buffer.duration.toFixed(1)} s · ${buffer.sampleRate} Hz` : "decoding…"}
                </span>
              )}
            </div>
            {rec.error && <p className="mt-2 text-xs text-destructive">{rec.error}</p>}
            {!rec.supported && <p className="mt-2 text-xs text-amber-200">Recording is not supported in this browser — upload a file instead.</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">Tips: use headphones, keep a steady distance, hum on “da” or “na” for clearer note starts, and avoid background music. Limit {MAX_ANALYSIS_SECONDS} s.</p>
            {buffer && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" aria-label={player.playing ? "Pause" : "Play"} onClick={() => (player.playing ? player.pause() : void player.play())}>
                  {player.playing ? <Pause /> : <Play />}
                </Button>
                <Waveform buffer={buffer} height={64} playheadSec={player.time} onSeek={(s) => player.seek(s)} />
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel
              title="2 · Analysis"
              actions={
                progress !== null ? (
                  <Button size="xs" variant="ghost" onClick={() => abortRef.current?.abort()}>
                    <X /> Cancel
                  </Button>
                ) : undefined
              }
            >
              {!buffer ? (
                <p className="text-sm text-muted-foreground">Record or upload audio first.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Button onClick={() => void analyze()} disabled={progress !== null || buffer.duration > MAX_ANALYSIS_SECONDS}>
                      {progress !== null ? <LoaderCircle className="animate-spin" /> : <AudioWaveform />} {frames ? "Re-analyse pitch" : "Analyse pitch"}
                    </Button>
                    {progress !== null && <Progress value={progress * 100} className="max-w-xs" aria-label="Analysis progress" />}
                    {frames && progress === null && <span className="text-xs text-muted-foreground">{frames.length} frames · voiced {pct(result?.voicedRatio ?? 0)}</span>}
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  {result?.warnings.map((w) => (
                    <p key={w} className="rounded-md border border-amber-300/30 bg-amber-300/5 p-2 text-xs text-amber-100">{w}</p>
                  ))}
                  {result && (
                    <>
                      <PitchPlot contour={result.contour} notes={result.notes} duration={buffer.duration} minConfidence={minConf} playheadSec={player.playing ? player.time : undefined} />
                      <div className="text-xs text-muted-foreground">
                        Violet line = tracked pitch · bars = detected notes (brighter = more confident; grey = below the confidence cut-off).
                      </div>
                      <div className="scrollbar-thin max-h-48 overflow-y-auto rounded-md border border-border">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-panel text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1 text-left font-medium">#</th>
                              <th className="px-2 py-1 text-left font-medium">Note</th>
                              <th className="px-2 py-1 text-left font-medium">Start</th>
                              <th className="px-2 py-1 text-left font-medium">Length</th>
                              <th className="px-2 py-1 text-left font-medium">Tuning</th>
                              <th className="px-2 py-1 text-left font-medium">Confidence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.notes.map((n, i) => (
                              <tr key={i} className={n.confidence < minConf ? "text-muted-foreground/50" : ""}>
                                <td className="px-2 py-0.5 tabular">{i + 1}</td>
                                <td className="px-2 py-0.5">{midiToName(n.pitch + Number(transpose))}</td>
                                <td className="px-2 py-0.5 tabular">{n.startSec.toFixed(2)} s</td>
                                <td className="px-2 py-0.5 tabular">{Math.round((n.endSec - n.startSec) * 1000)} ms</td>
                                <td className="px-2 py-0.5 tabular">{n.centsOff > 0 ? "+" : ""}{n.centsOff} ¢</td>
                                <td className="px-2 py-0.5 tabular">{pct(n.confidence)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel title="Detection">
                <div className="flex flex-col gap-3">
                  <LabeledSlider label="Pitch sensitivity" value={sensitivity} onChange={setSensitivity} format={pct} hint="Higher detects breathier/quieter pitch but more false notes. Re-analyse after changing." />
                  <LabeledSlider label="Noise filter (gate)" value={noiseGate} min={-70} max={-20} step={1} onChange={setNoiseGate} format={(v) => `${v} dB`} />
                  <LabeledSlider label="Minimum note duration" value={minNoteMs} min={40} max={400} step={10} onChange={setMinNoteMs} format={(v) => `${v} ms`} />
                  <LabeledSlider label="Note split threshold" value={split} min={0.4} max={2} step={0.1} onChange={setSplit} format={(v) => `${v.toFixed(1)} st`} />
                  <label className="flex items-center justify-between text-sm">Octave correction <Switch checked={octaveFix} onCheckedChange={setOctaveFix} /></label>
                  <label className="flex items-center justify-between text-sm">Split on re-attacks <Switch checked={onsets} onCheckedChange={setOnsets} /></label>
                </div>
              </Panel>
              <Panel title="3 · Convert">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tempo (BPM)">
                      <SimpleSelect
                        value={String(tempo ?? "project")}
                        onChange={(v) => setTempo(v === "project" ? null : Number(v))}
                        options={[{ value: "project", label: `Project (${project.bpm})` }, ...[60, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140].map((b) => ({ value: String(b), label: `${b}` }))]}
                        ariaLabel="Tempo"
                      />
                    </Field>
                    <Field label="Quantize grid">
                      <SimpleSelect value={gridId} onChange={setGridId} options={GRID_OPTIONS.map((g) => ({ value: g.id, label: g.label }))} ariaLabel="Quantize grid" />
                    </Field>
                    <Field label="Octave shift">
                      <SimpleSelect value={transpose} onChange={setTranspose} options={[-24, -12, 0, 12, 24].map((t) => ({ value: String(t), label: t === 0 ? "None" : `${t > 0 ? "+" : ""}${t / 12} oct` }))} ariaLabel="Octave shift" />
                    </Field>
                    <Field label="Place at bar">
                      <SimpleSelect value={startBar} onChange={setStartBar} options={Array.from({ length: 64 }, (_, i) => ({ value: String(i + 1), label: `Bar ${i + 1}` }))} ariaLabel="Start bar" />
                    </Field>
                  </div>
                  <LabeledSlider label="Quantize strength" value={qStrength} onChange={setQStrength} format={pct} />
                  <LabeledSlider label="Minimum confidence" value={minConf} onChange={setMinConf} format={pct} />
                  <Field label="Mode">
                    <SimpleSelect value={mode} onChange={setMode} options={[{ value: "merge", label: "Add to melody" }, { value: "replace", label: "Replace melody" }]} ariaLabel="Mode" />
                  </Field>
                  <label className="flex items-center justify-between text-sm">Keep audio in project <Switch checked={keepAudio} onCheckedChange={setKeepAudio} /></label>
                  <Button onClick={() => void sendToPianoRoll()} disabled={!accepted.length}>
                    Send {accepted.length} notes to Piano Roll
                  </Button>
                  <p className="text-[11px] text-muted-foreground">The first detected note is placed on the chosen bar. Your current melody is saved as a version first.</p>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
