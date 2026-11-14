"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Info, LoaderCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field, SimpleSelect } from "@/components/common/form";
import { useProjectStore } from "@/stores/project-store";
import { useAssistantStore, type AssistantRun } from "@/stores/assistant-store";
import { useAIStatus, callAI, AIRequestError } from "@/hooks/use-ai";
import {
  LYRICS_TASKS,
  LYRICS_TASK_LABELS,
  SUGGESTION_MODES,
  type LyricsRequest,
  type LyricsResponse,
  type LyricsTask,
  type SuggestionMode,
} from "@/lib/ai/schemas";
import type { LyricsAnalysis } from "@/lib/lyrics/analysis";
import { keyLabel } from "@/lib/music/theory";
import { createLine, uid } from "@/lib/project/factory";
import type { Project } from "@/lib/project/schema";

type Focus = "song" | "section" | "line";

export function buildLyricsRequest(project: Project, analysis: LyricsAnalysis | null, task: LyricsTask, mode: SuggestionMode, focusLineIds?: string[], note?: string): LyricsRequest {
  const byLine = new Map(analysis?.sections.flatMap((s) => s.lines.map((l) => [l.lineId, l] as const)) ?? []);
  return {
    task,
    mode,
    context: {
      title: project.title,
      genre: project.genre,
      mood: project.mood,
      language: project.language,
      bpm: project.bpm,
      key: keyLabel(project.key, project.scale),
    },
    sections: project.sections
      .filter((s) => s.lines.some((l) => l.text.trim()))
      .map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        lines: s.lines
          .filter((l) => l.text.trim())
          .slice(0, 80)
          .map((l) => ({
            id: l.id,
            text: l.text.slice(0, 400),
            syllables: byLine.get(l.id)?.syllableCount ?? 0,
            endRhyme: byLine.get(l.id)?.endRhyme?.label.slice(0, 40),
          })),
      }))
      .slice(0, 40),
    focusLineIds,
    note: note?.trim() || undefined,
  };
}

function SuggestionCard({ run, index }: { run: AssistantRun; index: number }) {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const setStatus = useAssistantStore((s) => s.setStatus);
  const s = run.response.suggestions[index];
  const status = run.status[index] ?? "open";
  const [drafts, setDrafts] = useState(() => s.alternatives.map((a) => a.text));
  const line = project?.sections.flatMap((sec) => sec.lines).find((l) => l.id === s.lineId);

  function replaceLine(text: string) {
    if (!line) return;
    update((d) => {
      for (const sec of d.sections) {
        const ln = sec.lines.find((l) => l.id === line.id);
        if (ln) {
          ln.text = text;
          ln.syllableOverride = null;
        }
      }
    });
    setStatus(run.id, index, "applied");
    toast.success("Line replaced (Ctrl+Z to undo)");
  }

  function insertBelow(text: string) {
    if (!line) return;
    update((d) => {
      for (const sec of d.sections) {
        const i = sec.lines.findIndex((l) => l.id === line.id);
        if (i >= 0) sec.lines.splice(i + 1, 0, createLine(text));
      }
    });
    toast.success("Alternative inserted below the original");
  }

  return (
    <li className={`rounded-md border p-2.5 ${status === "open" ? "border-border bg-card" : "border-border/50 bg-card/40 opacity-70"}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <Badge variant="secondary" className="font-normal">{s.category}</Badge>
        {status !== "open" && <span className="text-[11px] text-muted-foreground">{status}</span>}
        {status === "open" && (
          <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Dismiss suggestion" onClick={() => setStatus(run.id, index, "dismissed")}>
            <X />
          </Button>
        )}
      </div>
      <p className="text-xs">{s.issue}</p>
      {line && <p className="mt-1 rounded bg-background/50 px-2 py-1 text-xs text-muted-foreground">Original: {line.text}</p>}
      {s.lineId && !line && <p className="mt-1 text-[11px] text-amber-200">The referenced line no longer exists.</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {s.alternatives.map((a, ai) => (
          <li key={ai} className="flex flex-col gap-1">
            <Textarea
              value={drafts[ai]}
              onChange={(e) => setDrafts((d) => d.map((x, k) => (k === ai ? e.target.value : x)))}
              rows={1}
              className="min-h-8 text-sm"
              aria-label={`Alternative ${ai + 1}`}
            />
            <p className="text-[11px] text-muted-foreground">{a.rationale}</p>
            {line && status === "open" && (
              <div className="flex gap-1">
                <Button size="xs" onClick={() => replaceLine(drafts[ai])} disabled={!drafts[ai].trim()}>
                  <Check /> Replace line
                </Button>
                <Button size="xs" variant="outline" onClick={() => insertBelow(drafts[ai])} disabled={!drafts[ai].trim()}>
                  Insert below
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function LyricsAssistant({ analysis, focusLineId, focusSectionId }: { analysis: LyricsAnalysis | null; focusLineId: string | null; focusSectionId: string | null }) {
  const project = useProjectStore((s) => s.project);
  const ai = useAIStatus();
  const runs = useAssistantStore((s) => s.runs);
  const addRun = useAssistantStore((s) => s.addRun);
  const [task, setTask] = useState<LyricsTask>("analyze");
  const [mode, setMode] = useState<SuggestionMode>("conservative");
  const [focus, setFocus] = useState<Focus>("song");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!project) return null;
  const projectRuns = runs.filter((r) => r.projectId === project.id);
  const hasLyrics = project.sections.some((s) => s.lines.some((l) => l.text.trim()));

  async function run() {
    if (!project) return;
    setBusy(true);
    setError(null);
    let focusIds: string[] | undefined;
    if (focus === "line" && focusLineId) focusIds = [focusLineId];
    if (focus === "section" && focusSectionId) focusIds = project.sections.find((s) => s.id === focusSectionId)?.lines.map((l) => l.id);
    try {
      const req = buildLyricsRequest(project, analysis, task, mode, focusIds, note);
      const res = await callAI<LyricsResponse>("/api/ai/lyrics", req);
      addRun({ id: uid("run"), projectId: project.id, task, mode, createdAt: Date.now(), provider: res.provider, model: res.model, response: res.result, status: {} });
    } catch (err) {
      setError(err instanceof AIRequestError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {ai && !ai.configured && (
        <div className="flex items-start gap-2 rounded-md border border-violet/30 bg-violet/5 p-2.5 text-xs">
          <Info className="mt-0.5 size-4 shrink-0 text-violet" />
          <div>
            <div className="font-medium">AI provider not configured</div>
            <p className="text-muted-foreground">{ai.reason} The rule-based syllable, rhyme and repetition analysis in the editor keeps working.</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Task" className="col-span-2">
          <SimpleSelect value={task} onChange={setTask} options={LYRICS_TASKS.map((t) => ({ value: t, label: LYRICS_TASK_LABELS[t] }))} ariaLabel="Assistant task" />
        </Field>
        <Field label="Mode">
          <SimpleSelect
            value={mode}
            onChange={setMode}
            options={SUGGESTION_MODES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))}
            ariaLabel="Suggestion mode"
          />
        </Field>
        <Field label="Focus">
          <SimpleSelect
            value={focus}
            onChange={setFocus}
            options={[
              { value: "song", label: "Whole song" },
              { value: "section", label: "Current section" },
              { value: "line", label: "Current line" },
            ]}
            ariaLabel="Focus"
          />
        </Field>
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Optional note, e.g. keep the Isan words, make the hook more catchy" aria-label="Note to the assistant" />
      <p className="text-[11px] text-muted-foreground">
        {mode === "conservative" ? "Minimal changes." : mode === "creative" ? "Moderate experimentation." : "Unconventional alternatives."} Suggestions never change your lyrics until you click Replace or Insert.
      </p>
      <Button onClick={() => void run()} disabled={busy || !ai?.configured || !hasLyrics || ((focus === "line" && !focusLineId) || (focus === "section" && !focusSectionId))}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {busy ? "Asking the assistant…" : "Get suggestions"}
      </Button>
      {!hasLyrics && <p className="text-[11px] text-muted-foreground">Write some lyrics first.</p>}
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}

      {projectRuns.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="text-[11px] text-muted-foreground">
            {LYRICS_TASK_LABELS[r.task]} · {r.mode} · {r.model} · {new Date(r.createdAt).toLocaleTimeString()}
          </div>
          <p className="text-sm">{r.response.summary}</p>
          {r.response.structureNotes.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {r.response.structureNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-2">
            {r.response.suggestions.map((_, i) => (
              <SuggestionCard key={i} run={r} index={i} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
