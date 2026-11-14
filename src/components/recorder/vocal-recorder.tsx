"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Circle, Headphones, Mic, Square, TriangleExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, LabeledSlider, PageHeader, Panel, SimpleSelect, EmptyState } from "@/components/common/form";
import { LevelMeter } from "@/components/audio/waveform";
import { TakeRow } from "./take-row";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useRecorder } from "@/hooks/use-recorder";
import { decodeBlob } from "@/hooks/use-blob-player";
import { audioEngine } from "@/lib/audio/engine";
import { playFrom, setMix, stopPlayback } from "@/lib/audio/transport-actions";
import { addAudioAsset } from "@/lib/audio/assets";
import { formatClock, ticksPerBar, ticksToSeconds } from "@/lib/music/timing";

const MAX_TAKE_SECONDS = 600;

export function VocalRecorder() {
  const project = useProjectStore((s) => s.project);
  const mix = useTransportStore((s) => s.mix);
  const metronome = useTransportStore((s) => s.metronome);
  const [deviceId, setDeviceId] = useState<string>("");
  const [processing, setProcessing] = useState({ echo: false, noise: false, agc: false });
  const rec = useRecorder({ maxSeconds: MAX_TAKE_SECONDS, deviceId: deviceId || undefined, echoCancellation: processing.echo, noiseSuppression: processing.noise, autoGainControl: processing.agc });
  const [monitorOn, setMonitorOn] = useState(false);
  const [monitorGain, setMonitorGain] = useState(0.6);
  const [countIn, setCountIn] = useState("1");
  const [startBar, setStartBar] = useState("1");
  const [backing, setBacking] = useState({ chords: true, melody: false });
  const [phase, setPhaseState] = useState<"idle" | "countin" | "recording" | "saving">("idle");
  const phaseRef = useRef(phase);
  const setPhase = useCallback((p: typeof phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // Apply monitoring gain.
  const { setMonitorGain: applyMonitorGain } = rec;
  useEffect(() => applyMonitorGain(monitorOn ? monitorGain : 0), [monitorOn, monitorGain, applyMonitorGain]);

  const takes = (project?.audioAssets ?? []).filter((a) => a.kind === "take").sort((a, b) => b.createdAt - a.createdAt);

  const startRecording = useCallback(async () => {
    if (!project || phaseRef.current !== "idle") return;
    const ok = await rec.open();
    if (!ok) return;
    const startTick = (Number(startBar) - 1) * ticksPerBar(project.timeSignature);
    setMix({ chordsMuted: !backing.chords, melodyMuted: !backing.melody });
    setPhase("countin");
    stopPlayback();
    await audioEngine.countIn(Number(countIn), project.bpm, project.timeSignature);
    // The ref may have changed while awaiting the count-in (user cancelled).
    if ((phaseRef.current as string) !== "countin") return;
    const started = await rec.start();
    if (!started) {
      setPhase("idle");
      return;
    }
    await playFrom(startTick);
    useTransportStore.getState().set({ isRecording: true });
    setPhase("recording");
  }, [project, rec, startBar, backing, countIn, setPhase]);

  const stopRecording = useCallback(async () => {
    if (!project) return;
    if (phaseRef.current === "countin") {
      setPhase("idle");
      return;
    }
    if (phaseRef.current !== "recording") return;
    setPhase("saving");
    const blob = await rec.stop();
    stopPlayback();
    useTransportStore.getState().set({ isRecording: false });
    setMix({ chordsMuted: false, melodyMuted: false });
    if (!blob) {
      toast.error("Nothing was recorded.");
      setPhase("idle");
      return;
    }
    try {
      let duration = rec.elapsed;
      try {
        duration = (await decodeBlob(blob)).duration;
      } catch {
        /* keep elapsed estimate */
      }
      const startTick = (Number(startBar) - 1) * ticksPerBar(project.timeSignature);
      const n = takes.length + 1;
      await addAudioAsset(blob, { kind: "take", name: `Take ${n}`, durationSec: duration, offsetSec: ticksToSeconds(startTick, project.bpm), notes: "" });
      toast.success(`Take ${n} saved`);
    } catch (err) {
      toast.error(`Could not save the take: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPhase("idle");
    }
  }, [project, rec, startBar, takes.length, setPhase]);

  // Wire the transport bar's Record button to this page.
  const handlersRef = useRef<{ start: () => Promise<void>; stop: () => Promise<void> }>({ start: async () => {}, stop: async () => {} });
  useEffect(() => {
    handlersRef.current = { start: startRecording, stop: stopRecording };
  }, [startRecording, stopRecording]);

  // Register once; the handler always calls the latest start/stop through the ref.
  useEffect(() => {
    const handler = () => void (phaseRef.current === "idle" ? handlersRef.current.start() : handlersRef.current.stop());
    useTransportStore.getState().set({ recordHandler: handler });
    return () => useTransportStore.getState().set({ recordHandler: null, isRecording: false });
  }, []);

  if (!project) return null;

  const playWithBacking = (blob: Blob, offsetSec: number) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const tick = Math.round((offsetSec * project.bpm * 480) / 60);
    void playFrom(tick);
    void audio.play();
    audio.addEventListener("ended", () => {
      stopPlayback();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Mic} title="Vocal Recorder" description="Record takes over the metronome and chord backing. Use headphones so the backing doesn't bleed into the microphone." />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Panel title="Input">
              <div className="flex flex-col gap-3">
                {!rec.supported && <p className="text-sm text-amber-200">This browser can’t record audio. Use a recent Chrome, Edge, Firefox or Safari.</p>}
                {rec.state === "idle" || rec.state === "error" ? (
                  <Button variant="outline" onClick={() => void rec.open()} disabled={!rec.supported}>
                    <Mic /> Enable microphone
                  </Button>
                ) : null}
                {rec.error && <p className="text-xs text-destructive">{rec.error}</p>}
                {rec.devices.length > 0 && (
                  <Field label="Microphone">
                    <SimpleSelect
                      value={deviceId || "default"}
                      onChange={(v) => {
                        setDeviceId(v === "default" ? "" : v);
                        rec.close();
                        setTimeout(() => void rec.open(), 50);
                      }}
                      options={[{ value: "default", label: "System default" }, ...rec.devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `Input ${i + 1}` }))]}
                      ariaLabel="Microphone"
                    />
                  </Field>
                )}
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Level</span>
                    {rec.peak > 0.98 && <span className="text-rose-300">clipping — lower input gain</span>}
                  </div>
                  <LevelMeter level={rec.level} peak={rec.peak} />
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <label className="flex items-center justify-between">Echo cancellation <Switch checked={processing.echo} onCheckedChange={(v) => { setProcessing((p) => ({ ...p, echo: v })); rec.close(); }} /></label>
                  <label className="flex items-center justify-between">Noise suppression <Switch checked={processing.noise} onCheckedChange={(v) => { setProcessing((p) => ({ ...p, noise: v })); rec.close(); }} /></label>
                  <label className="flex items-center justify-between">Auto gain <Switch checked={processing.agc} onCheckedChange={(v) => { setProcessing((p) => ({ ...p, agc: v })); rec.close(); }} /></label>
                  <p className="text-[11px] text-muted-foreground">Off = rawer, more natural vocals. Changing these re-opens the microphone.</p>
                </div>
              </div>
            </Panel>
            <Panel title="Monitoring">
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5"><Headphones className="size-4" /> Hear yourself</span>
                  <Switch checked={monitorOn} onCheckedChange={setMonitorOn} disabled={rec.state === "idle" || rec.state === "error"} />
                </label>
                {monitorOn && <LabeledSlider label="Monitor level" value={monitorGain} onChange={setMonitorGain} format={(v) => `${Math.round(v * 100)}%`} />}
                <p className="flex items-start gap-1.5 text-[11px] text-amber-100/90">
                  <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                  Browser monitoring has noticeable latency (often 20–100 ms, depending on device and driver). Use headphones to avoid feedback, or monitor through your audio interface instead.
                </p>
              </div>
            </Panel>
            <Panel title="Backing">
              <div className="flex flex-col gap-3 text-sm">
                <label className="flex items-center justify-between">Metronome <Switch checked={metronome} onCheckedChange={(v) => { audioEngine.setMetronome(v); useTransportStore.getState().set({ metronome: v }); }} /></label>
                <label className="flex items-center justify-between">Chords <Switch checked={backing.chords} onCheckedChange={(v) => setBacking((b) => ({ ...b, chords: v }))} /></label>
                <label className="flex items-center justify-between">Melody guide <Switch checked={backing.melody} onCheckedChange={(v) => setBacking((b) => ({ ...b, melody: v }))} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Count-in">
                    <SimpleSelect value={countIn} onChange={setCountIn} options={[{ value: "0", label: "None" }, { value: "1", label: "1 bar" }, { value: "2", label: "2 bars" }]} ariaLabel="Count-in" />
                  </Field>
                  <Field label="Start at">
                    <SimpleSelect value={startBar} onChange={setStartBar} options={Array.from({ length: 64 }, (_, i) => ({ value: String(i + 1), label: `Bar ${i + 1}` }))} ariaLabel="Start bar" />
                  </Field>
                </div>
                <LabeledSlider label="Backing volume" value={mix.chords} onChange={(v) => setMix({ chords: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="Record">
              <div className="flex flex-wrap items-center gap-3">
                {phase === "idle" ? (
                  <Button size="lg" onClick={() => void startRecording()} disabled={!rec.supported}>
                    <Circle className="fill-rose-400 text-rose-400" /> Record take {takes.length + 1}
                  </Button>
                ) : phase === "countin" ? (
                  <Button size="lg" variant="secondary" onClick={() => void stopRecording()}>
                    Counting in… (cancel)
                  </Button>
                ) : (
                  <Button size="lg" variant="destructive" onClick={() => void stopRecording()} disabled={phase === "saving"}>
                    <Square /> <span className="inline-block min-w-24 text-left tabular">{phase === "saving" ? "Saving…" : `Stop · ${formatClock(rec.elapsed)}`}</span>
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  Shortcut: the ● button in the transport bar. Limit {MAX_TAKE_SECONDS / 60} min per take. Takes are kept in this browser.
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Takes are aligned to the song start by the chosen bar. Browser recording adds a small, device-dependent offset — nudge timing in your DAW if needed.
              </p>
            </Panel>
            <Panel title={`Takes (${takes.length})`}>
              {takes.length === 0 ? (
                <EmptyState icon={Mic} title="No takes yet">Record a take, listen back, then record more — every take is kept until you delete it.</EmptyState>
              ) : (
                <ul className="flex flex-col gap-2">
                  {takes.map((t) => (
                    <TakeRow key={t.id} asset={t} onPlayWithBacking={(b) => playWithBacking(b, t.offsetSec)} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
