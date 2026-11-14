"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Drum, LoaderCircle, Play, RefreshCw, Send, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, PageHeader, Panel, SimpleSelect, EmptyState } from "@/components/common/form";
import { snapshotMelody } from "@/components/piano-roll/melody-versions";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useAIStatus, callAI, AIRequestError } from "@/hooks/use-ai";
import { endPreview, startPreview } from "@/lib/audio/transport-actions";
import { FLOW_PATTERNS, autoArrange, flowStats, flowToNotes, moveSyllable, slotTicks, slotsPerBar, type FlowLine, type FlowPattern, type SlotsPerBeat } from "@/lib/flow/flow";
import { rhymeColor } from "@/lib/lyrics/analysis";
import { keyLabel, mod12 } from "@/lib/music/theory";
import { ticksPerBar } from "@/lib/music/timing";
import type { FlowSection } from "@/lib/project/schema";
import type { FlowResponse } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const SPB_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "4", label: "16ths (4/beat)" },
  { value: "3", label: "8th triplets (3/beat)" },
  { value: "6", label: "16th triplets (6/beat)" },
  { value: "8", label: "32nds — double-time (8/beat)" },
  { value: "2", label: "8ths (2/beat)" },
];

interface Suggestion {
  name: string;
  description: string;
  placements: Record<string, number>;
  repaired: number;
}

export function FlowStudio() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const analysis = useLyricsAnalysis(project?.sections);
  const previewLabel = useTransportStore((s) => s.previewLabel);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const pos = useTransportStore((s) => s.positionTicks);
  const ai = useAIStatus();
  const [chosenSectionId, setSectionId] = useState<string>("");
  const [pattern, setPattern] = useState<FlowPattern>("straight");
  const [landRhymes, setLandRhymes] = useState(true);
  const [selectedSyl, setSelectedSyl] = useState<string | null>(null);
  const [startBar, setStartBar] = useState("1");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const sections = useMemo(() => (project?.sections ?? []).filter((s) => s.lines.some((l) => l.text.trim())), [project?.sections]);
  // Default to the first Rap Verse (or first section with lyrics) until the user picks one.
  const sectionId =
    chosenSectionId && sections.some((s) => s.id === chosenSectionId)
      ? chosenSectionId
      : ((sections.find((s) => s.type === "rapVerse") ?? sections[0])?.id ?? "");

  const section = sections.find((s) => s.id === sectionId) ?? null;
  const secAnalysis = analysis?.sections.find((s) => s.sectionId === sectionId) ?? null;
  const flow: FlowSection | null = project?.flow.find((f) => f.sectionId === sectionId) ?? null;
  const spb = (flow?.slotsPerBeat ?? 4) as SlotsPerBeat;
  const barsPerLine = flow?.barsPerLine ?? 1;

  const lines: FlowLine[] = useMemo(() => {
    if (!section || !secAnalysis) return [];
    return section.lines
      .filter((l) => l.text.trim())
      .map((l) => {
        const la = secAnalysis.lines.find((x) => x.lineId === l.id);
        return { lineId: l.id, tokens: la?.tokens ?? [], endRhymeTokenId: la?.endGroup != null ? la.endToken?.id : null };
      });
  }, [section, secAnalysis]);

  if (!project) return null;
  const ts = project.timeSignature;
  const perBar = slotsPerBar(spb, ts);
  const lineSlots = perBar * barsPerLine;
  const placements = flow?.placements ?? {};
  const st = slotTicks(spb, ts);
  const startTick = (Number(startBar) - 1) * ticksPerBar(ts);

  function writeFlow(patch: Partial<FlowSection>) {
    update((d) => {
      const existing = d.flow.find((f) => f.sectionId === sectionId);
      if (existing) Object.assign(existing, patch);
      else d.flow.push({ sectionId, slotsPerBeat: spb, barsPerLine, placements: {}, ...patch });
    });
  }

  function arrange(p: FlowPattern = pattern, spbOverride?: SlotsPerBeat, bplOverride?: number) {
    const s = spbOverride ?? (p === "triplet" ? 3 : p === "doubleTime" ? 8 : spb === 3 || spb === 8 ? 4 : spb);
    const bpl = bplOverride ?? barsPerLine;
    const res = autoArrange(lines, p, s as SlotsPerBeat, bpl, ts, landRhymes);
    writeFlow({ slotsPerBeat: s as SlotsPerBeat, barsPerLine: bpl, placements: res.placements });
    res.warnings.forEach((w) => toast.warning(w));
  }

  const lineOf = (globalSlot: number) => Math.floor(globalSlot / lineSlots);
  const allTokens = lines.flatMap((l) => l.tokens);
  const unplaced = allTokens.filter((t) => placements[t.id] === undefined);
  const stats = flowStats(Object.fromEntries(allTokens.filter((t) => placements[t.id] !== undefined).map((t) => [t.id, placements[t.id]])), spb, ts);

  function move(id: string, to: number) {
    writeFlow({ placements: moveSyllable(placements, id, Math.max(0, to)) });
  }

  function blips() {
    return allTokens
      .filter((t) => placements[t.id] !== undefined)
      .map((t) => {
        const end = lines.find((l) => l.lineId === t.lineId)?.endRhymeTokenId === t.id;
        return { tick: startTick + Math.round(placements[t.id] * st), accent: t.stressed || end, pitch: end ? 81 : t.stressed ? 77 : 72 };
      });
  }

  function preview(label: string, pl: Record<string, number> = placements) {
    if (previewLabel === label && isPlaying) {
      endPreview();
      return;
    }
    const b = allTokens
      .filter((t) => pl[t.id] !== undefined)
      .map((t) => ({ tick: startTick + Math.round(pl[t.id] * st), accent: t.stressed, pitch: t.stressed ? 77 : 72 }));
    const end = startTick + lines.length * lineSlots * st;
    void startPreview(label, { bpm: project!.bpm, timeSignature: ts, notes: [], chords: [], drums: true, blips: label === "Flow preview" ? blips() : b, endTick: end }, startTick);
  }

  function sendToMelody() {
    if (!project) return;
    const root = project.key;
    let pitch = project.vocalRange.low;
    while (mod12(pitch) !== root) pitch++;
    const notes = flowToNotes(placements, allTokens, spb, ts, startTick, pitch);
    if (!notes.length) return;
    const end = startTick + lines.length * lineSlots * st;
    snapshotMelody("Before flow import", "manual");
    update((d) => {
      d.notes = [...d.notes.filter((n) => n.startTick < startTick || n.startTick >= end), ...notes];
    });
    toast.success(`${notes.length} rhythm notes added on ${keyLabel(project.key, project.scale).split(" ")[0]} — shape the pitches in the Piano Roll`);
  }

  async function askAI() {
    if (!project) return;
    setAiBusy(true);
    try {
      const res = await callAI<FlowResponse>("/api/ai/flow", {
        context: { title: project.title, genre: project.genre, mood: project.mood, language: project.language, bpm: project.bpm, key: keyLabel(project.key, project.scale) },
        slotsPerBeat: spb,
        beatsPerBar: ts.numerator,
        barsPerLine,
        lines: lines.slice(0, 32).map((l, i) => ({
          lineId: l.lineId,
          lineIndex: i,
          syllables: l.tokens.slice(0, 64).map((t) => ({ id: t.id, text: t.text.slice(0, 40), stressed: t.stressed, rhyme: (t.rhyme?.label ?? "").slice(0, 40) })),
        })),
      });
      // Validate & repair: keep only known syllables, clamp into the line, enforce increasing order.
      const sugg: Suggestion[] = res.result.arrangements.map((a) => {
        const given = new Map(a.placements.map((p) => [p.syllableId, Math.round(p.slot)]));
        const pl: Record<string, number> = {};
        let repaired = 0;
        lines.forEach((l, li) => {
          let prev = -1;
          l.tokens.forEach((t, ti) => {
            let s = given.get(t.id);
            const remaining = l.tokens.length - ti - 1;
            if (s === undefined || !Number.isFinite(s)) {
              s = prev + 1;
              repaired++;
            }
            const clamped = Math.max(prev + 1, Math.min(lineSlots - 1 - remaining, s));
            if (clamped !== s) repaired++;
            pl[t.id] = li * lineSlots + Math.max(0, clamped);
            prev = Math.max(0, clamped);
          });
        });
        return { name: a.name, description: a.description, placements: pl, repaired };
      });
      setSuggestions(sugg);
      if (!sugg.length) toast("The assistant returned no arrangements.");
    } catch (err) {
      toast.error(err instanceof AIRequestError ? err.message : "Flow suggestions failed.");
    } finally {
      setAiBusy(false);
    }
  }

  const playingFlow = previewLabel === "Flow preview" && isPlaying;
  const playSlot = playingFlow ? Math.floor((pos - startTick) / st) : -1;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Drum} title="Rap Flow Studio" description="Place syllables on the beat grid. Drag chips (or select one and use ← → / Shift+← →) to move them; empty cells are rests." />
      {sections.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={Drum} title="No lyrics yet">
            Write lines in the <Link href={`/studio/${project.id}/lyrics`} className="text-mint hover:underline">Lyrics Studio</Link> first — a Rap Verse section works best.
          </EmptyState>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row">
          <aside className="scrollbar-thin flex max-h-[45vh] shrink-0 flex-col gap-3 overflow-y-auto border-b border-border bg-panel p-3 @4xl:max-h-none @4xl:w-[300px] @4xl:border-r @4xl:border-b-0">
            <Field label="Section">
              <SimpleSelect value={sectionId} onChange={(v) => { setSectionId(v); setSuggestions([]); }} options={sections.map((s) => ({ value: s.id, label: s.label }))} ariaLabel="Section" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Grid">
                <SimpleSelect value={String(spb)} onChange={(v) => { const n = Number(v) as SlotsPerBeat; const res = autoArrange(lines, n === 3 ? "triplet" : n === 8 ? "doubleTime" : "straight", n, barsPerLine, ts, landRhymes); writeFlow({ slotsPerBeat: n, placements: res.placements }); }} options={SPB_OPTIONS} ariaLabel="Grid subdivision" />
              </Field>
              <Field label="Bars per line">
                <SimpleSelect value={String(barsPerLine)} onChange={(v) => arrange(pattern, spb, Number(v))} options={[1, 2].map((b) => ({ value: String(b), label: `${b} bar${b > 1 ? "s" : ""}` }))} ariaLabel="Bars per line" />
              </Field>
            </div>
            <Field label="Pattern" hint={FLOW_PATTERNS[pattern].description}>
              <SimpleSelect value={pattern} onChange={setPattern} options={(Object.keys(FLOW_PATTERNS) as FlowPattern[]).map((p) => ({ value: p, label: FLOW_PATTERNS[p].label }))} ariaLabel="Flow pattern" />
            </Field>
            <label className="flex items-center justify-between text-sm">Land end rhymes on the last beat <Switch checked={landRhymes} onCheckedChange={setLandRhymes} /></label>
            <Button onClick={() => arrange()} disabled={!lines.length}>
              <RefreshCw /> Auto-arrange section
            </Button>
            <Field label="Start at bar (preview & export)">
              <SimpleSelect value={startBar} onChange={setStartBar} options={Array.from({ length: 64 }, (_, i) => ({ value: String(i + 1), label: `Bar ${i + 1}` }))} ariaLabel="Start bar" />
            </Field>
            <div className="flex gap-2">
              <Button variant={playingFlow ? "secondary" : "outline"} className="flex-1" onClick={() => preview("Flow preview")} disabled={!Object.keys(placements).length}>
                {playingFlow ? <Square /> : <Play />} {playingFlow ? "Stop" : "Preview with beat"}
              </Button>
            </div>
            <Button variant="outline" onClick={sendToMelody} disabled={!Object.keys(placements).length}>
              <Send /> Send rhythm to melody
            </Button>
            {ai?.configured && (
            <div className="border-t border-border pt-3">
              <Button variant="outline" className="w-full" onClick={() => void askAI()} disabled={aiBusy || !ai?.configured || !lines.length}>
                {aiBusy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} AI flow ideas
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">{ai?.configured ? "Suggests alternative placements only — your lyrics are never rewritten." : `Needs an AI provider. ${ai?.reason ?? ""}`}</p>
            </div>
            )}
          </aside>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
            {unplaced.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/5 p-2 text-xs">
                <span className="text-amber-100">{unplaced.length} syllable(s) not placed yet (lyrics changed?).</span>
                <Button size="xs" variant="secondary" onClick={() => arrange()}>Auto-arrange</Button>
              </div>
            )}
            <div className="flex flex-col gap-2" onKeyDown={(e) => {
              if (!selectedSyl || placements[selectedSyl] === undefined) return;
              const step = e.shiftKey ? spb : 1;
              if (e.key === "ArrowRight") { e.preventDefault(); move(selectedSyl, placements[selectedSyl] + step); }
              if (e.key === "ArrowLeft") { e.preventDefault(); move(selectedSyl, placements[selectedSyl] - step); }
              if (e.key === "Escape") setSelectedSyl(null);
            }}>
              {lines.map((line, li) => {
                const base = li * lineSlots;
                const bySlot = new Map<number, (typeof line.tokens)[number]>();
                for (const t of allTokens) {
                  const s = placements[t.id];
                  if (s !== undefined && lineOf(s) === li) bySlot.set(s - base, t);
                }
                const placedHere = [...bySlot.values()].length;
                const offbeat = [...bySlot.keys()].filter((k) => k % spb !== 0).length;
                return (
                  <div key={line.lineId} className="rounded-md border border-border bg-card/60 p-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">Line {li + 1}</span>
                      <span className="truncate">{section?.lines.find((l) => l.id === line.lineId)?.text}</span>
                      <span className="ml-auto tabular">
                        {placedHere}/{lineSlots} slots · density {Math.round((placedHere / lineSlots) * 100)}% · rests {lineSlots - placedHere} · off-beat {placedHere ? Math.round((offbeat / placedHere) * 100) : 0}%
                      </span>
                    </div>
                    <div className="grid gap-px overflow-x-auto" style={{ gridTemplateColumns: `repeat(${lineSlots}, minmax(30px, 1fr))` }}>
                      {Array.from({ length: lineSlots }, (_, k) => {
                        const t = bySlot.get(k);
                        const isBeat = k % spb === 0;
                        const isBar = k % perBar === 0;
                        const group = t ? secAnalysis?.internal[t.id] : undefined;
                        const isEnd = t && line.endRhymeTokenId === t.id;
                        const lineEnd = secAnalysis?.lines.find((l) => l.lineId === line.lineId)?.endGroup;
                        return (
                          <div
                            key={k}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const id = e.dataTransfer.getData("text/syllable");
                              if (id) move(id, base + k);
                            }}
                            className={cn(
                              "flex h-11 items-center justify-center",
                              isBar ? "border-l-2 border-white/25" : isBeat ? "border-l border-white/15" : "border-l border-white/5",
                              isBeat ? "bg-white/[0.04]" : "bg-transparent",
                              playSlot === base + k && "bg-playhead/25",
                            )}
                            title={`Bar ${Math.floor(k / perBar) + 1}, beat ${Math.floor((k % perBar) / spb) + 1}${k % spb ? ` + ${k % spb}/${spb}` : ""}`}
                          >
                            {t && (
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/syllable", t.id);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onClick={() => setSelectedSyl(t.id === selectedSyl ? null : t.id)}
                                className={cn(
                                  "max-w-full cursor-grab truncate rounded px-1 py-0.5 text-xs active:cursor-grabbing",
                                  t.stressed && "font-semibold",
                                  selectedSyl === t.id && "ring-2 ring-mint",
                                )}
                                style={{
                                  background: group !== undefined ? `color-mix(in oklch, ${rhymeColor(group)} 25%, transparent)` : "oklch(1 0 0 / 8%)",
                                  color: group !== undefined ? rhymeColor(group) : undefined,
                                  boxShadow: isEnd && lineEnd != null ? `inset 0 -2px 0 ${rhymeColor(lineEnd)}` : undefined,
                                }}
                                aria-label={`${t.text}, slot ${k + 1}`}
                                aria-pressed={selectedSyl === t.id}
                              >
                                {t.text}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {stats.length > 0 && (
              <Panel title="Density per bar" className="mt-3">
                <div className="flex h-16 items-end gap-1">
                  {stats.map((s) => (
                    <div key={s.bar} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t-sm bg-mint/60" style={{ height: `${Math.max(4, s.density * 100)}%` }} title={`Bar ${s.bar}: ${s.syllables} syllables, ${s.offbeat} off-beat`} />
                      <span className="text-[10px] text-muted-foreground tabular">{s.bar}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {suggestions.length > 0 && (
              <Panel title="AI flow ideas" className="mt-3">
                <ul className="flex flex-col gap-2">
                  {suggestions.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel p-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.description}</div>
                        {s.repaired > 0 && <div className="text-[11px] text-amber-200">{s.repaired} placement(s) were outside the grid or out of order and were adjusted.</div>}
                      </div>
                      <Button size="xs" variant="outline" onClick={() => preview(`AI idea: ${s.name}`, s.placements)}>
                        <Play /> Preview
                      </Button>
                      <Button size="xs" onClick={() => { writeFlow({ placements: s.placements }); toast.success(`Applied “${s.name}” (Ctrl+Z to undo)`); }}>
                        Apply
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
