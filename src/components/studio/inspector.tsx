"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Field, SimpleSelect } from "@/components/common/form";
import {
  GENRE_OPTIONS,
  KEY_OPTIONS,
  LANGUAGE_OPTIONS,
  PITCH_OPTIONS,
  SCALE_OPTIONS,
  TIME_SIGNATURE_OPTIONS,
  parseTimeSignature,
} from "@/components/common/music-options";
import { useProjectStore } from "@/stores/project-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAssistantStore } from "@/stores/assistant-store";
import { useAIStatus } from "@/hooks/use-ai";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { audioEngine } from "@/lib/audio/engine";
import { chordSymbol, isInScale, midiToName, prefersFlats, romanNumeral, voiceChord } from "@/lib/music/theory";
import { formatBarBeat, ticksPerBar } from "@/lib/music/timing";
import { setVelocity, transposeNotes, updateNote } from "@/lib/music/note-ops";
import type { Language } from "@/lib/project/schema";
import type { ScaleName } from "@/lib/music/theory";

function Group({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** Number input that commits on blur/Enter and validates range. */
function CommitNumber({
  value,
  min,
  max,
  onCommit,
  ariaLabel,
  step = 1,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(String(value));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(n) && n >= min && n <= max;
  const commit = () => {
    if (valid && n !== value) onCommit(n);
    else if (!valid) setText(String(value));
  };
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      aria-label={ariaLabel}
      aria-invalid={!valid}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8"
    />
  );
}

export function Inspector() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const selected = useEditorStore((s) => s.selectedNoteIds);
  const ai = useAIStatus();
  const runs = useAssistantStore((s) => s.runs);
  const analysis = useLyricsAnalysis(project?.sections);

  const selectedNotes = useMemo(() => (project ? project.notes.filter((n) => selected.includes(n.id)) : []), [project, selected]);
  const syllableOptions = useMemo(() => {
    if (!analysis) return [];
    return Object.values(analysis.tokensById).map((t) => ({ value: t.id, label: `${t.text} · ${t.word}` }));
  }, [analysis]);

  if (!project) return null;
  const flats = prefersFlats(project.key, project.scale);
  const bar = ticksPerBar(project.timeSignature);
  const chords = [...project.chords].sort((a, b) => a.startTick - b.startTick);
  const pitches = project.notes.map((n) => n.pitch);
  const lowest = pitches.length ? Math.min(...pitches) : null;
  const highest = pitches.length ? Math.max(...pitches) : null;
  const outOfRange = project.notes.filter((n) => n.pitch < project.vocalRange.low || n.pitch > project.vocalRange.high);
  const projectRuns = runs.filter((r) => r.projectId === project.id);
  const openSuggestions = projectRuns.flatMap((r) =>
    r.response.suggestions.map((s, i) => ({ s, i, run: r })).filter(({ i }) => (r.status[i] ?? "open") === "open"),
  );
  const single = selectedNotes.length === 1 ? selectedNotes[0] : null;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <Group title="Song">
        <Field label="Title" htmlFor="insp-title">
          <Input
            id="insp-title"
            value={project.title}
            maxLength={160}
            onChange={(e) => update((d) => void (d.title = e.target.value || "Untitled Song"), { coalesce: "title" })}
            className="h-8"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Genre">
            <SimpleSelect
              size="sm"
              value={GENRE_OPTIONS.some((g) => g.value === project.genre) ? project.genre : "Other"}
              onChange={(v) => update((d) => void (d.genre = v))}
              options={GENRE_OPTIONS}
              ariaLabel="Genre"
            />
          </Field>
          <Field label="Language">
            <SimpleSelect size="sm" value={project.language} onChange={(v: Language) => update((d) => void (d.language = v))} options={LANGUAGE_OPTIONS} ariaLabel="Language" />
          </Field>
        </div>
        <Field label="Mood" htmlFor="insp-mood">
          <Input id="insp-mood" value={project.mood} maxLength={120} onChange={(e) => update((d) => void (d.mood = e.target.value), { coalesce: "mood" })} className="h-8" placeholder="e.g. heartbroken, intimate" />
        </Field>
      </Group>

      <Group title="Key · Tempo">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Key">
            <SimpleSelect size="sm" value={String(project.key)} onChange={(v) => update((d) => void (d.key = Number(v)))} options={KEY_OPTIONS} ariaLabel="Key" />
          </Field>
          <Field label="Scale">
            <SimpleSelect size="sm" value={project.scale} onChange={(v: ScaleName) => update((d) => void (d.scale = v))} options={SCALE_OPTIONS} ariaLabel="Scale" />
          </Field>
          <Field label="BPM">
            <CommitNumber value={project.bpm} min={30} max={300} step={0.5} ariaLabel="BPM" onCommit={(v) => update((d) => void (d.bpm = v))} />
          </Field>
          <Field label="Time">
            <SimpleSelect
              size="sm"
              value={`${project.timeSignature.numerator}/${project.timeSignature.denominator}`}
              onChange={(v) => update((d) => void (d.timeSignature = parseTimeSignature(v)))}
              options={TIME_SIGNATURE_OPTIONS.some((o) => o.value === `${project.timeSignature.numerator}/${project.timeSignature.denominator}`) ? TIME_SIGNATURE_OPTIONS : [...TIME_SIGNATURE_OPTIONS, { value: `${project.timeSignature.numerator}/${project.timeSignature.denominator}`, label: `${project.timeSignature.numerator}/${project.timeSignature.denominator}` }]}
              ariaLabel="Time signature"
            />
          </Field>
        </div>
      </Group>

      <Group title="Chord progression" action={<Link href={`/studio/${project.id}/chords`} className="text-[11px] text-mint hover:underline">Edit</Link>}>
        {chords.length === 0 ? (
          <p className="text-xs text-muted-foreground">No chords yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {chords.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void audioEngine.previewChord(voiceChord({ root: c.root, quality: c.quality, bass: c.bass }, c.octave + 1, c.inversion, c.spread))}
                className="rounded border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-xs hover:bg-violet/20"
                title={`Bar ${Math.floor(c.startTick / bar) + 1} · ${romanNumeral(c, project.key, project.scale)} — click to audition`}
              >
                {chordSymbol({ root: c.root, quality: c.quality, bass: c.bass }, flats)}
              </button>
            ))}
          </div>
        )}
      </Group>

      <Group title={selectedNotes.length ? `Note properties · ${selectedNotes.length} selected` : "Note properties"}>
        {selectedNotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Select notes in the Piano Roll to edit them here.</p>
        ) : (
          <>
            {single && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pitch">
                  <SimpleSelect
                    size="sm"
                    value={String(single.pitch)}
                    onChange={(v) => update((d) => void (d.notes = updateNote(d.notes, single.id, { pitch: Number(v) })))}
                    options={Array.from({ length: 61 }, (_, i) => ({ value: String(36 + i), label: midiToName(36 + i, flats) }))}
                    ariaLabel="Pitch"
                  />
                </Field>
                <Field label={`Start · ${formatBarBeat(single.startTick, project.timeSignature)}`}>
                  <CommitNumber value={single.startTick} min={0} max={10_000_000} ariaLabel="Start tick" onCommit={(v) => update((d) => void (d.notes = updateNote(d.notes, single.id, { startTick: v })))} />
                </Field>
                <Field label="Length (ticks)">
                  <CommitNumber value={single.durationTicks} min={1} max={1_000_000} ariaLabel="Duration in ticks" onCommit={(v) => update((d) => void (d.notes = updateNote(d.notes, single.id, { durationTicks: v })))} />
                </Field>
                <Field label="Syllable">
                  <SimpleSelect
                    size="sm"
                    value={single.syllableId ?? "none"}
                    onChange={(v) => update((d) => void (d.notes = updateNote(d.notes, single.id, { syllableId: v === "none" ? null : v })))}
                    options={[{ value: "none", label: "— none —" }, ...syllableOptions]}
                    ariaLabel="Linked syllable"
                  />
                </Field>
              </div>
            )}
            <Field label={`Velocity ${single ? single.velocity : "(sets all selected)"}`}>
              <Slider
                value={[single ? single.velocity : Math.round(selectedNotes.reduce((a, n) => a + n.velocity, 0) / selectedNotes.length)]}
                min={1}
                max={127}
                step={1}
                aria-label="Velocity"
                onValueChange={(v) => update((d) => void (d.notes = setVelocity(d.notes, new Set(selected), v[0])), { coalesce: "velocity" })}
              />
            </Field>
            <div className="flex flex-wrap gap-1">
              {[-12, -1, 1, 12].map((st) => (
                <Button key={st} variant="outline" size="xs" onClick={() => update((d) => void (d.notes = transposeNotes(d.notes, new Set(selected), st)))}>
                  {st > 0 ? `+${st}` : st} st
                </Button>
              ))}
            </div>
            {selectedNotes.some((n) => !isInScale(n.pitch, project.key, project.scale)) && (
              <p className="text-[11px] text-amber-200">Some selected notes are outside the {project.scale} scale.</p>
            )}
          </>
        )}
      </Group>

      <Group title="Vocal range">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lowest">
            <SimpleSelect size="sm" value={String(project.vocalRange.low)} onChange={(v) => update((d) => void (d.vocalRange.low = Math.min(Number(v), d.vocalRange.high)))} options={PITCH_OPTIONS} ariaLabel="Lowest vocal note" />
          </Field>
          <Field label="Highest">
            <SimpleSelect size="sm" value={String(project.vocalRange.high)} onChange={(v) => update((d) => void (d.vocalRange.high = Math.max(Number(v), d.vocalRange.low)))} options={PITCH_OPTIONS} ariaLabel="Highest vocal note" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {lowest === null
            ? "No melody notes yet."
            : `Melody spans ${midiToName(lowest, flats)}–${midiToName(highest!, flats)} (${highest! - lowest} semitones).`}
        </p>
        {outOfRange.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300/30 bg-amber-300/5 px-2 py-1.5 text-[11px] text-amber-100">
            <span>{outOfRange.length} note(s) outside the range</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                update((d) => {
                  for (const n of d.notes) {
                    while (n.pitch < d.vocalRange.low && n.pitch + 12 <= 127) n.pitch += 12;
                    while (n.pitch > d.vocalRange.high && n.pitch - 12 >= 0) n.pitch -= 12;
                  }
                })
              }
            >
              Fold by octaves
            </Button>
          </div>
        )}
      </Group>

      {ai?.configured && (
      <Group title="AI suggestions" action={<Link href={`/studio/${project.id}/lyrics`} className="text-[11px] text-mint hover:underline">Lyrics assistant</Link>}>
        {ai && !ai.configured ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" /> AI provider not configured. {ai.reason}
          </p>
        ) : openSuggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open suggestions. Run the lyrics assistant to get editable alternatives.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {openSuggestions.slice(0, 4).map(({ s, i, run }) => (
              <li key={`${run.id}-${i}`} className="rounded-md border border-border bg-card p-2 text-xs">
                <div className="mb-0.5 flex items-center gap-1">
                  <Sparkles className="size-3 text-violet" />
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">{s.category}</Badge>
                </div>
                <p className="line-clamp-2 text-muted-foreground">{s.issue}</p>
              </li>
            ))}
            {openSuggestions.length > 4 && <li className="text-[11px] text-muted-foreground">+{openSuggestions.length - 4} more in Lyrics Studio</li>}
          </ul>
        )}
      </Group>
      )}
    </div>
  );
}
