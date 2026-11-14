"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Guitar, Play, Plus, Repeat, Shuffle, Trash, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Field, PageHeader, Panel, SimpleSelect } from "@/components/common/form";
import { KEY_OPTIONS } from "@/components/common/music-options";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { audioEngine } from "@/lib/audio/engine";
import { playFrom, setLoop, stopPlayback } from "@/lib/audio/transport-actions";
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_NAMES,
  PROGRESSION_PRESETS,
  chordPitchClasses,
  chordSymbol,
  diatonicChord,
  keyLabel,
  midiToName,
  parseProgression,
  pitchClassName,
  prefersFlats,
  presetChords,
  romanNumeral,
  voiceChord,
  type ChordQuality,
  type ChordSpec,
} from "@/lib/music/theory";
import { suggestProgressions, type ProgressionFlavor } from "@/lib/music/progressions";
import { ticksPerBar } from "@/lib/music/timing";
import { chordsFromSpecs, uid } from "@/lib/project/factory";
import type { ChordEvent } from "@/lib/project/schema";
import { cn } from "@/lib/utils";

const LENGTH_OPTIONS = [
  { value: "0.25", label: "1 beat" },
  { value: "0.5", label: "½ bar" },
  { value: "1", label: "1 bar" },
  { value: "2", label: "2 bars" },
  { value: "4", label: "4 bars" },
];

/** Recompute start ticks so chords are back-to-back in list order. */
function resequence(chords: ChordEvent[]): ChordEvent[] {
  let t = 0;
  return chords.map((c) => {
    const next = { ...c, startTick: t };
    t += c.durationTicks;
    return next;
  });
}

export function ChordStudio() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const loop = useTransportStore((s) => s.loop);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const [text, setText] = useState("");
  const [sevenths, setSevenths] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [flavor, setFlavor] = useState<ProgressionFlavor>("triads");
  const [seed, setSeed] = useState(1);
  if (!project) return null;

  const flats = prefersFlats(project.key, project.scale);
  const bar = ticksPerBar(project.timeSignature);
  const chords = [...project.chords].sort((a, b) => a.startTick - b.startTick);
  const sel = chords.find((c) => c.id === selected) ?? null;
  const totalTicks = chords.reduce((a, c) => a + c.durationTicks, 0);
  const suggestions = suggestProgressions(project.key, project.scale, flavor, seed, 4);

  const setChords = (next: ChordEvent[]) => update((d) => void (d.chords = resequence(next)));
  const audition = (c: ChordSpec & { octave?: number; inversion?: number; spread?: boolean }) =>
    void audioEngine.previewChord(voiceChord(c, (c.octave ?? 3) + 1, c.inversion ?? 0, c.spread ?? false));
  const replaceWith = (specs: ChordSpec[], label: string) => {
    setChords(chordsFromSpecs(specs, bar));
    setSelected(null);
    toast.success(`Progression set: ${label}`);
  };
  const append = (spec: ChordSpec) => {
    const ev: ChordEvent = { id: uid("ch"), root: spec.root, quality: spec.quality, bass: spec.bass ?? null, startTick: totalTicks, durationTicks: bar, inversion: 0, octave: 3, spread: false };
    setChords([...chords, ev]);
    setSelected(ev.id);
    audition(spec);
  };
  const patchSel = (patch: Partial<ChordEvent>) => {
    if (!sel) return;
    setChords(chords.map((c) => (c.id === sel.id ? { ...c, ...patch } : c)));
  };

  async function playLoop() {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!totalTicks) return;
    setLoop({ enabled: true, start: 0, end: totalTicks });
    await playFrom(0);
  }

  const palette = Array.from({ length: 7 }, (_, d) => diatonicChord(project.key, project.scale, d, sevenths));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Guitar}
        title="Chord Studio"
        description={`${keyLabel(project.key, project.scale)} · ${project.bpm} BPM. Chord tones appear as reference bands in the Piano Roll.`}
        actions={
          <>
            <Button size="sm" variant={isPlaying ? "secondary" : "default"} onClick={() => void playLoop()} disabled={!chords.length}>
              {isPlaying ? <Volume2 /> : <Repeat />} {isPlaying ? "Stop" : "Loop progression"}
            </Button>
          </>
        }
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <Panel title={`Progression · ${chords.length} chords · ${(totalTicks / bar).toFixed(totalTicks % bar ? 2 : 0)} bars`} actions={loop.enabled ? <Badge variant="secondary">loop on</Badge> : undefined}>
            {chords.length === 0 ? (
              <p className="text-sm text-muted-foreground">Empty. Pick a preset, type chords, or click chords in the palette below.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {chords.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c.id);
                      audition(c);
                    }}
                    className={cn(
                      "flex min-w-20 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors",
                      selected === c.id ? "border-mint bg-mint/10" : "border-border bg-panel hover:border-violet/60",
                    )}
                    style={{ flexBasis: `${Math.max(80, (c.durationTicks / bar) * 110)}px` }}
                    aria-pressed={selected === c.id}
                  >
                    <span className="text-base font-semibold">{chordSymbol(c, flats)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {romanNumeral(c, project.key, project.scale)} · bar {Math.floor(c.startTick / bar) + 1} · {LENGTH_OPTIONS.find((o) => Number(o.value) * bar === c.durationTicks)?.label ?? `${c.durationTicks} ticks`}
                    </span>
                    <span className="sr-only">Chord {i + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const { chords: specs, invalid } = parseProgression(text);
                if (invalid.length) {
                  toast.error(`Could not read: ${invalid.join(", ")}`);
                  return;
                }
                if (!specs.length) return;
                replaceWith(specs, text);
                setText("");
              }}
            >
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type chords: Am – F – C – G  or  Dm7 G7 Cmaj7" aria-label="Chord progression text" />
              <Button type="submit" variant="outline" disabled={!text.trim()}>
                Set
              </Button>
            </form>
          </Panel>

          {sel && (
            <Panel
              title={`Selected · ${chordSymbol(sel, flats)}`}
              actions={
                <>
                  <Button size="icon-xs" variant="ghost" aria-label="Move left" disabled={chords[0].id === sel.id} onClick={() => { const i = chords.findIndex((c) => c.id === sel.id); const next = [...chords]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setChords(next); }}>
                    <ArrowLeft />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Move right" disabled={chords[chords.length - 1].id === sel.id} onClick={() => { const i = chords.findIndex((c) => c.id === sel.id); const next = [...chords]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setChords(next); }}>
                    <ArrowRight />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Audition" onClick={() => audition(sel)}>
                    <Play />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Delete chord" onClick={() => { setChords(chords.filter((c) => c.id !== sel.id)); setSelected(null); }}>
                    <Trash />
                  </Button>
                </>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Root">
                  <SimpleSelect size="sm" value={String(sel.root)} onChange={(v) => patchSel({ root: Number(v) })} options={KEY_OPTIONS} ariaLabel="Chord root" />
                </Field>
                <Field label="Quality">
                  <SimpleSelect size="sm" value={sel.quality} onChange={(v: ChordQuality) => patchSel({ quality: v })} options={CHORD_QUALITY_NAMES.map((q) => ({ value: q, label: `${CHORD_QUALITIES[q].label}${CHORD_QUALITIES[q].symbol ? ` (${CHORD_QUALITIES[q].symbol})` : ""}` }))} ariaLabel="Chord quality" />
                </Field>
                <Field label="Bass (slash)">
                  <SimpleSelect size="sm" value={sel.bass == null ? "none" : String(sel.bass)} onChange={(v) => patchSel({ bass: v === "none" ? null : Number(v) })} options={[{ value: "none", label: "Root" }, ...KEY_OPTIONS]} ariaLabel="Bass note" />
                </Field>
                <Field label="Length">
                  <SimpleSelect size="sm" value={String(sel.durationTicks / bar)} onChange={(v) => patchSel({ durationTicks: Math.round(Number(v) * bar) })} options={LENGTH_OPTIONS.some((o) => Number(o.value) * bar === sel.durationTicks) ? LENGTH_OPTIONS : [...LENGTH_OPTIONS, { value: String(sel.durationTicks / bar), label: `${sel.durationTicks} ticks` }]} ariaLabel="Chord length" />
                </Field>
                <Field label="Inversion">
                  <SimpleSelect size="sm" value={String(sel.inversion)} onChange={(v) => patchSel({ inversion: Number(v) })} options={["Root position", "1st", "2nd", "3rd"].map((l, i) => ({ value: String(i), label: l }))} ariaLabel="Inversion" />
                </Field>
                <Field label="Octave">
                  <SimpleSelect size="sm" value={String(sel.octave)} onChange={(v) => patchSel({ octave: Number(v) })} options={[2, 3, 4, 5].map((o) => ({ value: String(o), label: `Octave ${o}` }))} ariaLabel="Octave" />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={sel.spread} onCheckedChange={(v) => patchSel({ spread: v })} /> Open (spread) voicing
                </label>
                <span className="text-xs text-muted-foreground">
                  Notes: {voiceChord(sel, sel.octave, sel.inversion, sel.spread).map((p) => midiToName(p, flats)).join(" · ")} · tones {chordPitchClasses(sel).map((pc) => pitchClassName(pc, flats)).join(" ")}
                </span>
              </div>
            </Panel>
          )}

          <Panel
            title={`Diatonic palette · ${keyLabel(project.key, project.scale)}`}
            actions={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Sevenths <Switch checked={sevenths} onCheckedChange={setSevenths} />
              </label>
            }
          >
            <div className="flex flex-wrap gap-2">
              {palette.map((c, i) => (
                <div key={i} className="flex overflow-hidden rounded-md border border-border">
                  <button type="button" className="px-3 py-1.5 text-sm hover:bg-accent" onClick={() => audition(c)} aria-label={`Audition ${chordSymbol(c, flats)}`}>
                    <span className="font-medium">{chordSymbol(c, flats)}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{romanNumeral(c, project.key, project.scale)}</span>
                  </button>
                  <button type="button" className="border-l border-border px-2 hover:bg-mint/15" onClick={() => append(c)} aria-label={`Add ${chordSymbol(c, flats)}`}>
                    <Plus className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Common progressions">
              <ul className="flex flex-col gap-1.5">
                {PROGRESSION_PRESETS.map((p) => {
                  const specs = presetChords(p, project.key, project.scale);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5">
                      <div className="min-w-0">
                        <div className="text-sm">{specs.map((c) => chordSymbol(c, flats)).join(" – ")}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{p.name.split("(")[1]?.replace(")", "") ?? ""} · {p.description}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon-xs" variant="ghost" aria-label="Audition progression" onClick={() => specs.forEach((c, k) => setTimeout(() => audition(c), k * 700))}>
                          <Play />
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => replaceWith(specs, specs.map((c) => chordSymbol(c, flats)).join(" – "))}>
                          Use
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
            <Panel
              title="Generated ideas (rule-based)"
              actions={
                <>
                  <SimpleSelect size="sm" className="w-32" value={flavor} onChange={setFlavor} options={[{ value: "triads", label: "Triads" }, { value: "sevenths", label: "R&B sevenths" }, { value: "pop-color", label: "Pop colour" }]} ariaLabel="Progression flavour" />
                  <Button size="icon-xs" variant="ghost" aria-label="New ideas" onClick={() => setSeed((s) => s + 1)}>
                    <Shuffle />
                  </Button>
                </>
              }
            >
              <p className="mb-2 text-[11px] text-muted-foreground">Common functional patterns in the current key, recoloured by flavour. Shuffle for more.</p>
              <ul className="flex flex-col gap-1.5">
                {suggestions.map((sg, i) => (
                  <li key={`${seed}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="text-sm">{sg.chords.map((c) => chordSymbol(c, flats)).join(" – ")}</div>
                      <div className="text-[11px] text-muted-foreground">{sg.description}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon-xs" variant="ghost" aria-label="Audition progression" onClick={() => sg.chords.forEach((c, k) => setTimeout(() => audition(c), k * 700))}>
                        <Play />
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => replaceWith(sg.chords, sg.chords.map((c) => chordSymbol(c, flats)).join(" – "))}>
                        Use
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
