"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Dices, LoaderCircle, Play, RefreshCw, Sparkles, Square, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, LabeledSlider, PageHeader, Panel, SimpleSelect, EmptyState } from "@/components/common/form";
import { PianoRoll } from "@/components/piano-roll/piano-roll";
import { snapshotMelody } from "@/components/piano-roll/melody-versions";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useAIStatus, callAI, AIRequestError } from "@/hooks/use-ai";
import { endPreview, startPreview } from "@/lib/audio/transport-actions";
import {
  CONTOUR_LABELS,
  DEFAULT_CONTROLS,
  MELODY_STYLES,
  generateCandidates,
  regeneratePhrase,
  toMidiNotes,
  type MelodyCandidate,
  type MelodyControls,
  type MelodyInput,
  type MelodyStyleId,
  type PhraseInput,
  type PhrasePlan,
} from "@/lib/melody/generator";
import { keyLabel, midiToName } from "@/lib/music/theory";
import { PPQ, ticksPerBar } from "@/lib/music/timing";
import type { MelodyPlanResponse } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Fresh random seed (called from event handlers / lazy state init only). */
function randomSeed(max = 100000): number {
  return Math.floor(Math.random() * max);
}

export function MelodyDesigner() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const previewLabel = useTransportStore((s) => s.previewLabel);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const pos = useTransportStore((s) => s.positionTicks);
  const analysis = useLyricsAnalysis(project?.sections);
  const ai = useAIStatus();

  const [style, setStyle] = useState<MelodyStyleId>("rnb");
  const [controls, setControls] = useState<MelodyControls>({ ...DEFAULT_CONTROLS, ...MELODY_STYLES.rnb.defaults });
  const [selectedLines, setSelectedLines] = useState<Set<string> | null>(null);
  const [startBar, setStartBar] = useState("1");
  const [seed, setSeed] = useState(() => randomSeed());
  const [candidates, setCandidates] = useState<MelodyCandidate[]>([]);
  const [active, setActive] = useState<string>("");
  const [plans, setPlans] = useState<Record<string, PhrasePlan> | null>(null);
  const [planModel, setPlanModel] = useState<string | null>(null);
  const [busy, setBusy] = useState<"rule" | "ai" | null>(null);
  const [applyMode, setApplyMode] = useState<"replace" | "range">("range");

  const allLines = useMemo(
    () =>
      (project?.sections ?? []).flatMap((s) =>
        s.lines.filter((l) => l.text.trim()).map((l) => ({ section: s, line: l })),
      ),
    [project?.sections],
  );
  const chosen = useMemo(() => selectedLines ?? new Set(allLines.map((x) => x.line.id)), [selectedLines, allLines]);

  const phrases: PhraseInput[] = useMemo(() => {
    if (!analysis) return [];
    const byLine = new Map(analysis.sections.flatMap((s) => s.lines.map((l) => [l.lineId, l] as const)));
    return allLines
      .filter((x) => chosen.has(x.line.id))
      .map((x) => ({ lineId: x.line.id, text: x.line.text, sectionType: x.section.type, tokens: byLine.get(x.line.id)?.tokens ?? [] }))
      .filter((p) => p.tokens.length > 0);
  }, [analysis, allLines, chosen]);

  if (!project) return null;
  const bar = ticksPerBar(project.timeSignature);
  const startTick = Math.max(0, (Number(startBar) - 1) * bar);
  const isMixedThai = project.language !== "en";

  const input = (withPlans: Record<string, PhrasePlan> | null, s = seed): MelodyInput => ({
    phrases,
    key: project.key,
    scale: project.scale,
    timeSignature: project.timeSignature,
    chords: project.chords,
    vocalRange: project.vocalRange,
    startTick,
    style,
    controls,
    seed: s,
    plans: withPlans ?? undefined,
  });

  function runRule(newSeed?: number) {
    const s = newSeed ?? seed;
    if (newSeed !== undefined) setSeed(newSeed);
    const c = generateCandidates(input(null, s), 3);
    setPlans(null);
    setPlanModel(null);
    setCandidates(c);
    setActive(c[0]?.id ?? "");
  }

  async function runAI() {
    setBusy("ai");
    try {
      const res = await callAI<MelodyPlanResponse>("/api/ai/melody-plan", {
        context: { title: project!.title, genre: project!.genre, mood: project!.mood, language: project!.language, bpm: project!.bpm, key: keyLabel(project!.key, project!.scale) },
        style: MELODY_STYLES[style].label,
        phrases: phrases.slice(0, 40).map((p) => ({
          lineId: p.lineId,
          sectionType: p.sectionType,
          syllables: p.tokens.slice(0, 64).map((t) => ({ text: t.text.slice(0, 40), tone: t.thai?.tone ?? "" })),
        })),
      });
      const byLine = new Map(phrases.map((p) => [p.lineId, p.tokens.length]));
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      const map: Record<string, PhrasePlan> = {};
      for (const p of res.result.phrases) {
        const n = byLine.get(p.lineId);
        if (n === undefined) continue; // ignore plans for unknown lines
        map[p.lineId] = {
          contour: p.contour,
          peakSyllableIndex: Math.max(0, Math.min(n - 1, Math.round(p.peakSyllableIndex))),
          density: clamp(p.density),
          syncopation: clamp(p.syncopation),
          emphasisIndices: p.emphasisIndices.map(Math.round).filter((i) => i >= 0 && i < n),
          rationale: p.rationale,
        };
      }
      const c = generateCandidates(input(map), 3).map((cand) => ({ ...cand, name: `${cand.name} · AI-guided` }));
      setPlans(map);
      setPlanModel(res.model);
      setCandidates(c);
      setActive(c[0]?.id ?? "");
    } catch (err) {
      toast.error(err instanceof AIRequestError ? err.message : "AI plan failed.");
    } finally {
      setBusy(null);
    }
  }

  function audition(c: MelodyCandidate) {
    if (previewLabel === c.name && isPlaying) {
      endPreview();
      return;
    }
    void startPreview(c.name, { bpm: project!.bpm, timeSignature: project!.timeSignature, notes: c.notes, chords: project!.chords }, Math.max(0, startTick - 0));
  }

  function apply(c: MelodyCandidate, goToPianoRoll: boolean) {
    const notes = toMidiNotes(c.notes);
    const rangeStart = c.layout[0]?.startTick ?? startTick;
    const last = c.layout[c.layout.length - 1];
    const rangeEnd = last ? last.startTick + last.bars * bar : rangeStart;
    snapshotMelody(`Before applying ${c.name}`, "manual");
    update((d) => {
      d.notes = applyMode === "replace" ? notes : [...d.notes.filter((n) => n.startTick < rangeStart || n.startTick >= rangeEnd), ...notes];
    });
    snapshotMelody(c.name, plans ? "ai-guided" : "rule-based");
    endPreview();
    toast.success(`${c.name} applied (${notes.length} notes). Previous melody saved as a version.`);
    if (goToPianoRoll) router.push(`/studio/${project!.id}/piano-roll`);
  }

  function regen(c: MelodyCandidate, lineId: string) {
    const next = regeneratePhrase(input(plans), c, lineId, randomSeed(1e9));
    setCandidates((cs) => cs.map((x) => (x.id === c.id ? next : x)));
  }

  const setC = (k: keyof MelodyControls, v: number) => setControls((c) => ({ ...c, [k]: v }));
  const syllableText = (id: string) => analysis?.tokensById[id]?.text;
  const totalSyllables = phrases.reduce((n, p) => n + p.tokens.length, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Sparkles}
        title="AI Melody Designer"
        description="Generates editable vocal melody sketches from your lyrics using transparent rules (chord tones, contours, rhythm templates, soft Thai-tone preferences)."
      />
      <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row">
        <aside className="scrollbar-thin flex max-h-[50vh] shrink-0 flex-col gap-4 overflow-y-auto border-b border-border bg-panel p-3 @4xl:max-h-none @4xl:w-[320px] @4xl:border-r @4xl:border-b-0">
          <section>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Lyrics to set ({chosen.size}/{allLines.length} lines · {totalSyllables} syllables)</h3>
            {allLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No lyrics yet. <Link className="text-mint hover:underline" href={`/studio/${project.id}/lyrics`}>Write some in the Lyrics Studio</Link>.
              </p>
            ) : (
              <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
                {project.sections.map((s) => {
                  const lines = s.lines.filter((l) => l.text.trim());
                  if (!lines.length) return null;
                  const allOn = lines.every((l) => chosen.has(l.id));
                  return (
                    <div key={s.id}>
                      <label className="flex items-center gap-2 px-1.5 py-1 text-xs font-medium">
                        <Checkbox
                          checked={allOn}
                          onCheckedChange={(v) => {
                            const next = new Set(chosen);
                            lines.forEach((l) => (v ? next.add(l.id) : next.delete(l.id)));
                            setSelectedLines(next);
                          }}
                        />
                        {s.label}
                      </label>
                      {lines.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 py-0.5 pr-1 pl-5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={chosen.has(l.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(chosen);
                              if (v) next.add(l.id);
                              else next.delete(l.id);
                              setSelectedLines(next);
                            }}
                          />
                          <span className="truncate">{l.text}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Field label="Style" hint={MELODY_STYLES[style].description}>
            <SimpleSelect
              value={style}
              onChange={(v: MelodyStyleId) => {
                setStyle(v);
                setControls((c) => ({ ...c, ...MELODY_STYLES[v].defaults }));
              }}
              options={Object.values(MELODY_STYLES).map((s) => ({ value: s.id, label: s.label }))}
              ariaLabel="Melody style"
            />
          </Field>

          <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
            {keyLabel(project.key, project.scale)} · {project.bpm} BPM · {project.timeSignature.numerator}/{project.timeSignature.denominator} · range {midiToName(project.vocalRange.low)}–{midiToName(project.vocalRange.high)} · {project.chords.length} chords
            <div className="mt-0.5">Change these in the inspector or Chord Studio.</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Bars per line">
              <SimpleSelect value={String(controls.phraseBars)} onChange={(v) => setControls((c) => ({ ...c, phraseBars: Number(v) as 1 | 2 | 4 }))} options={[{ value: "1", label: "1 bar" }, { value: "2", label: "2 bars" }, { value: "4", label: "4 bars" }]} ariaLabel="Bars per line" />
            </Field>
            <Field label="Start at bar">
              <SimpleSelect value={startBar} onChange={setStartBar} options={Array.from({ length: 64 }, (_, i) => ({ value: String(i + 1), label: `Bar ${i + 1}` }))} ariaLabel="Start bar" />
            </Field>
          </div>

          <LabeledSlider label="Melodic range" value={controls.range} onChange={(v) => setC("range", v)} format={pct} hint="Share of your vocal range to use." />
          <LabeledSlider label="Rhythmic density" value={controls.density} onChange={(v) => setC("density", v)} format={pct} hint="Quarter notes → 16ths per syllable." />
          <LabeledSlider label="Repetition" value={controls.repetition} onChange={(v) => setC("repetition", v)} format={pct} hint="Reuse rhythms/phrases for similar or repeated lines." />
          <LabeledSlider label="Emotional intensity" value={controls.intensity} onChange={(v) => setC("intensity", v)} format={pct} hint="Higher tessitura, deeper contours, stronger dynamics." />
          <LabeledSlider label="Syncopation" value={controls.syncopation} onChange={(v) => setC("syncopation", v)} format={pct} />
          <LabeledSlider label="Complexity" value={controls.complexity} onChange={(v) => setC("complexity", v)} format={pct} hint="Variety of pitch choices." />
          {isMixedThai && (
            <LabeledSlider label="Thai tone adherence" value={controls.toneAdherence} onChange={(v) => setC("toneAdherence", v)} format={pct} hint="Soft preference for melodic direction that matches lexical tones. Not a one-to-one mapping." />
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => runRule()} disabled={!phrases.length || busy !== null}>
                <WandSparkles /> Generate 3 candidates
              </Button>
              <Button size="icon" variant="outline" aria-label="New random seed and generate" onClick={() => runRule(randomSeed())} disabled={!phrases.length}>
                <Dices />
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">Seed {seed} · same seed + settings = same result.</div>
            {ai?.configured && (
            <>
            <Button variant="outline" onClick={() => void runAI()} disabled={!phrases.length || busy !== null || !ai?.configured}>
              {busy === "ai" ? <LoaderCircle className="animate-spin" /> : <Sparkles />} AI-guided candidates
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {ai?.configured
                ? "The AI provider suggests a contour, peak and emphasis per phrase; the same rule engine turns that plan into notes."
                : `AI-guided mode needs a provider. ${ai?.reason ?? ""}`}
            </p>
            </>
            )}
          </div>
        </aside>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          {candidates.length === 0 ? (
            <EmptyState icon={Sparkles} title="No candidates yet">
              Select lines, choose a style and press “Generate 3 candidates”. Each candidate links every note to a syllable, so lyrics show in the Piano Roll.
            </EmptyState>
          ) : (
            <Tabs value={active} onValueChange={setActive}>
              <TabsList>
                {candidates.map((c, i) => (
                  <TabsTrigger key={c.id} value={c.id}>
                    {"ABC"[i]} · {CONTOUR_LABELS[c.contour].split(" ")[0]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {candidates.map((c) => {
                const m = c.metrics;
                const playingThis = previewLabel === c.name && isPlaying;
                const first = c.layout[0]?.startTick ?? 0;
                const last = c.layout[c.layout.length - 1];
                const lengthTicks = last ? last.startTick + last.bars * bar : bar * 4;
                return (
                  <TabsContent key={c.id} value={c.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-medium">{c.name}</h2>
                      <Badge variant="secondary" className="font-normal">{plans ? `AI-guided plan (${planModel}) + rules` : "Rule-based"}</Badge>
                      <div className="ml-auto flex flex-wrap gap-1.5">
                        <Button size="sm" variant={playingThis ? "secondary" : "outline"} onClick={() => audition(c)}>
                          {playingThis ? <Square /> : <Play />} {playingThis ? "Stop" : "Audition with chords"}
                        </Button>
                        <SimpleSelect size="sm" className="w-44" value={applyMode} onChange={setApplyMode} options={[{ value: "range", label: "Replace notes in range" }, { value: "replace", label: "Replace whole melody" }]} ariaLabel="Apply mode" />
                        <Button size="sm" onClick={() => apply(c, false)}>
                          <Check /> Apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => apply(c, true)}>
                          Apply & edit
                        </Button>
                      </div>
                    </div>
                    <div className="h-64 overflow-hidden rounded-md border border-border">
                      <PianoRoll
                        className="h-full"
                        notes={c.notes}
                        selectedIds={[]}
                        timeSignature={project.timeSignature}
                        chords={project.chords}
                        keyPc={project.key}
                        scale={project.scale}
                        vocalRange={project.vocalRange}
                        gridTicks={PPQ / 4}
                        snap
                        tool="select"
                        zoomX={48}
                        zoomY={9}
                        showLyrics
                        syllableText={syllableText}
                        positionTicks={playingThis ? pos : first}
                        isPlaying={playingThis}
                        followPlayhead
                        lengthTicks={lengthTicks}
                        readOnly
                        showVelocity={false}
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Panel title="Evaluation">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <dt className="text-muted-foreground">Notes</dt>
                          <dd className="tabular">{m.noteCount}</dd>
                          <dt className="text-muted-foreground">Range</dt>
                          <dd className="tabular">{m.lowest}–{m.highest} ({m.rangeSemitones} st)</dd>
                          <dt className="text-muted-foreground">Chord tones on strong beats</dt>
                          <dd className="tabular">{pct(m.chordToneRatioStrong)}</dd>
                          <dt className="text-muted-foreground">Chord fit (by duration)</dt>
                          <dd className="tabular">{pct(m.chordFitWeighted)}</dd>
                          <dt className="text-muted-foreground">Stepwise motion</dt>
                          <dd className="tabular">{pct(m.stepwiseRatio)}</dd>
                          <dt className="text-muted-foreground">Off-grid (syncopated) onsets</dt>
                          <dd className="tabular">{pct(m.syncopatedRatio)}</dd>
                          {m.toneTotal > 0 && (
                            <>
                              <dt className="text-muted-foreground">Thai tone direction</dt>
                              <dd className="tabular">
                                {m.toneGood} fit · {m.toneConflict} against · {m.toneTotal - m.toneGood - m.toneConflict} neutral
                              </dd>
                            </>
                          )}
                        </dl>
                      </Panel>
                      <Panel title="How it was made">
                        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                          {c.explanation.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </Panel>
                    </div>
                    <Panel title="Phrases">
                      <ul className="flex flex-col gap-1.5">
                        {c.layout.map((lay) => {
                          const ph = phrases.find((p) => p.lineId === lay.lineId);
                          const notes = c.notes.filter((n) => n.lineId === lay.lineId);
                          const conflicts = notes.filter((n) => n.toneFit === "conflict").length;
                          const plan = plans?.[lay.lineId];
                          return (
                            <li key={lay.lineId} className="flex items-start gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">{ph?.text}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  bar {Math.floor(lay.startTick / bar) + 1} · {lay.bars} bar(s) · {notes.length} notes
                                  {notes.length ? ` · ${midiToName(Math.min(...notes.map((n) => n.pitch)))}–${midiToName(Math.max(...notes.map((n) => n.pitch)))}` : ""}
                                  {conflicts > 0 && <span className="text-amber-200"> · {conflicts} tone-direction conflict(s)</span>}
                                </div>
                                {plan?.rationale && <div className="text-[11px] text-violet/90">Plan: {plan.contour} — {plan.rationale}</div>}
                              </div>
                              <Button size="xs" variant="ghost" onClick={() => regen(c, lay.lineId)}>
                                <RefreshCw /> Regenerate
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </Panel>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
          {candidates.length > 0 && (
            <p className={cn("mt-3 text-[11px] text-muted-foreground")}>
              Linguistic naturalness can’t be guaranteed automatically — sing it back, then fix awkward syllables in the Piano Roll.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
