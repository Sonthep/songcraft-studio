"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, PenLine, Plus, RotateCcwClock, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, PageHeader } from "@/components/common/form";
import { SectionEditor, type DisplayOptions } from "./section-editor";
import { RhymeFinder } from "./rhyme-finder";
import { LyricsAssistant } from "./lyrics-assistant";
import { useProjectStore } from "@/stores/project-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useAIStatus } from "@/hooks/use-ai";
import { createSection, uid } from "@/lib/project/factory";
import { SECTION_LABELS, SECTION_TYPES, type LyricsVersion } from "@/lib/project/schema";
import { downloadBlob, formatLyricSheet, formatLyricsForSuno, safeFilename } from "@/lib/export/text";
import { rhymeColor, type LyricsAnalysis } from "@/lib/lyrics/analysis";
import { relativeTime } from "@/components/project/project-list";

function LyricsVersions() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const [name, setName] = useState("");
  if (!project) return null;
  const save = (n: string) => {
    const v: LyricsVersion = { id: uid("lv"), name: n, createdAt: Date.now(), sections: structuredClone(project.sections) };
    update((d) => {
      d.lyricsVersions.unshift(v);
      if (d.lyricsVersions.length > 200) d.lyricsVersions.length = 200;
    });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <RotateCcwClock /> Versions ({project.lyricsVersions.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <form
          className="flex gap-2 border-b border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(name.trim() || `Draft ${project.lyricsVersions.length + 1}`);
            setName("");
            toast.success("Lyrics version saved");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Version name" className="h-7" aria-label="Version name" maxLength={120} />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
        <ul className="scrollbar-thin max-h-72 overflow-y-auto p-1">
          {project.lyricsVersions.length === 0 && <li className="p-3 text-xs text-muted-foreground">No saved versions yet.</li>}
          {project.lyricsVersions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{v.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {v.sections.reduce((n, s) => n + s.lines.filter((l) => l.text.trim()).length, 0)} lines · {relativeTime(v.createdAt)}
                </div>
              </div>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  save(`Before restoring “${v.name}”`);
                  update((d) => void (d.sections = structuredClone(v.sections)));
                  toast.success(`Restored “${v.name}” (current lyrics saved as a version)`);
                }}
              >
                Restore
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Delete version ${v.name}`} onClick={() => update((d) => void (d.lyricsVersions = d.lyricsVersions.filter((x) => x.id !== v.id)))}>
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AlliterationSummary({ analysis }: { analysis: LyricsAnalysis }) {
  const rows = analysis.sections.flatMap((s) => s.lines.flatMap((l, i) => l.alliterations.map((a) => ({ a, line: i + 1, key: `${l.lineId}-${a.group}`, text: l.text }))));
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Alliteration · สัมผัสอักษร</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No line has two content syllables with the same initial sound yet (e.g. ร้อน·รน·รัก, เหงา·งาน).</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 40).map(({ a, key, text }) => (
            <li key={key} className="flex items-baseline gap-2 text-xs" title={text}>
              <span className="w-10 shrink-0 font-mono" style={{ color: rhymeColor(a.group + 3) }}>{a.label}</span>
              <span className="min-w-0 flex-1 truncate">{a.texts.join(" · ")}</span>
              {a.approximate && <span className="text-[10px] text-amber-200">approx.</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Matched by sound: ข ค ฆ = /kʰ/, ซ ศ ษ ส = /s/, silent ห/อ follows the next consonant (หนาว = /n/).</p>
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: LyricsAnalysis | null }) {
  const project = useProjectStore((s) => s.project);
  if (!analysis || !project) return null;
  const content = analysis.repetitions.filter((r) => r.content).slice(0, 20);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Overview</h4>
        <p className="text-xs text-muted-foreground">
          {analysis.totalSyllables} syllables across {project.sections.length} sections. Counts and rhymes are rule-based estimates; override any line with “edit syllables”.
        </p>
      </div>
      <div>
        <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Rhyme schemes</h4>
        <ul className="flex flex-col gap-1">
          {analysis.sections.map((s) => {
            const sec = project.sections.find((x) => x.id === s.sectionId);
            return (
              <li key={s.sectionId} className="flex items-center justify-between gap-2 text-xs">
                <a href={`#${s.sectionId}`} className="truncate hover:text-mint">{sec?.label}</a>
                <span className="font-mono">
                  {s.lines.map((l, i) => (
                    <span key={i} style={{ color: l.endGroup != null ? rhymeColor(l.endGroup) : undefined }}>
                      {l.letter ?? "·"}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Syllables per line</h4>
        <ul className="flex flex-col gap-1.5">
          {analysis.sections.map((s) => {
            const max = Math.max(1, ...s.lines.map((l) => l.syllableCount));
            const sec = project.sections.find((x) => x.id === s.sectionId);
            return (
              <li key={s.sectionId}>
                <div className="text-[11px] text-muted-foreground">{sec?.label}</div>
                <div className="flex h-8 items-end gap-0.5">
                  {s.lines.map((l, i) => (
                    <div key={i} className="w-2.5 rounded-t-sm bg-mint/60" style={{ height: `${(l.syllableCount / max) * 100}%` }} title={`Line ${i + 1}: ${l.syllableCount} syllables`} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <AlliterationSummary analysis={analysis} />
      <div>
        <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Repeated words</h4>
        {content.length === 0 ? (
          <p className="text-xs text-muted-foreground">No repeated content words yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {content.map((r) => (
              <span key={r.word} className="rounded border border-border px-1.5 py-0.5 text-xs">
                {r.word} <span className="text-muted-foreground">×{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LyricsStudio() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const analysis = useLyricsAnalysis(project?.sections);
  const [display, setDisplay] = useState<DisplayOptions>({ syllables: true, internal: true, endRhymes: true, alliteration: true });
  const [rhymeQuery, setRhymeQuery] = useState("");
  const [tab, setTab] = useState("rhymes");
  const ai = useAIStatus();
  const [focus, setFocus] = useState<{ lineId: string | null; sectionId: string | null }>({ lineId: null, sectionId: null });

  const onPickWord = useCallback((w: string) => {
    setRhymeQuery(w);
    setTab("rhymes");
  }, []);
  const onFocusLine = useCallback((lineId: string, sectionId: string) => setFocus({ lineId, sectionId }), []);

  const lyricWords = useMemo(() => {
    if (!analysis) return [];
    return Array.from(new Set(Object.values(analysis.tokensById).map((t) => t.word)));
  }, [analysis]);

  // Scroll to a section when navigated with #hash.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

  if (!project) return null;
  const bySection = new Map(analysis?.sections.map((s) => [s.sectionId, s]) ?? []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PenLine}
        title="Lyrics Studio"
        description="Line-based editor with syllable and rhyme analysis for Thai, Isan and English. Click a syllable to find rhymes."
        actions={
          <>
            <LyricsVersions />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => downloadBlob(new Blob([formatLyricSheet(project)], { type: "text/plain;charset=utf-8" }), `${safeFilename(project.title)} - lyrics.txt`)}>
                  Lyric sheet (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadBlob(new Blob([formatLyricsForSuno(project.sections)], { type: "text/plain;charset=utf-8" }), `${safeFilename(project.title)} - tagged lyrics.txt`)}>
                  Lyrics with [Section] tags (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard.writeText(formatLyricsForSuno(project.sections)).then(() => toast.success("Lyrics copied"));
                  }}
                >
                  Copy tagged lyrics
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-panel px-3 py-1.5">
        <Toggle size="sm" pressed={display.syllables} onPressedChange={(v) => setDisplay((d) => ({ ...d, syllables: v }))}>
          Syllables
        </Toggle>
        <Toggle size="sm" pressed={display.endRhymes} onPressedChange={(v) => setDisplay((d) => ({ ...d, endRhymes: v }))}>
          End rhymes <span className="text-muted-foreground">สัมผัสนอก</span>
        </Toggle>
        <Toggle size="sm" pressed={display.internal} onPressedChange={(v) => setDisplay((d) => ({ ...d, internal: v }))}>
          Internal rhymes <span className="text-muted-foreground">สัมผัสสระ</span>
        </Toggle>
        <Toggle size="sm" pressed={display.alliteration} onPressedChange={(v) => setDisplay((d) => ({ ...d, alliteration: v }))}>
          Alliteration <span className="text-muted-foreground">สัมผัสอักษร</span>
        </Toggle>
        <span className="ml-auto text-[11px] text-muted-foreground">Dashed = uncertain · bold = stressed · color fill = same vowel sound · line above = same initial sound</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {project.sections.length === 0 && (
              <EmptyState icon={PenLine} title="No sections" action={<Button onClick={() => update((d) => void d.sections.push(createSection("verse")))}>Add a verse</Button>}>
                Songs are organised into sections like Verse, Chorus and Hook.
              </EmptyState>
            )}
            {project.sections.map((s, i) => (
              <SectionEditor
                key={s.id}
                section={s}
                index={i}
                total={project.sections.length}
                analysis={bySection.get(s.id)}
                display={display}
                onPickWord={onPickWord}
                onFocusLine={onFocusLine}
              />
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="self-start">
                  <Plus /> Add section
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SECTION_TYPES.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => update((d) => void d.sections.push(createSection(t)))}>
                    {SECTION_LABELS[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <aside className="flex max-h-[45vh] min-h-0 shrink-0 flex-col border-t border-border bg-panel @4xl:max-h-none @4xl:w-[340px] @4xl:border-t-0 @4xl:border-l">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-2 w-auto">
              <TabsTrigger value="rhymes">Rhymes</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              {ai?.configured && <TabsTrigger value="assistant">AI Assistant</TabsTrigger>}
            </TabsList>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              <TabsContent value="rhymes">
                <RhymeFinder initialQuery={rhymeQuery} lyricWords={lyricWords} compact />
              </TabsContent>
              <TabsContent value="analysis">
                <AnalysisPanel analysis={analysis} />
              </TabsContent>
              {ai?.configured && (
                <TabsContent value="assistant">
                  <LyricsAssistant analysis={analysis} focusLineId={focus.lineId} focusSectionId={focus.sectionId} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
