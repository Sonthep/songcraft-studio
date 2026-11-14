"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Info, LoaderCircle, Sparkles, TriangleExclamationPoint, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, PageHeader, Panel } from "@/components/common/form";
import { useProjectStore } from "@/stores/project-store";
import { useLyricsAnalysis } from "@/hooks/use-lyrics-analysis";
import { useAIStatus, callAI, AIRequestError } from "@/hooks/use-ai";
import { measureSong } from "@/lib/coach/measure";
import { LESSONS } from "@/lib/coach/lessons";
import { COACH_TOPICS, COACH_TOPIC_LABELS, type CoachResponse, type CoachTopic } from "@/lib/ai/schemas";
import { formatLyricsForSuno } from "@/lib/export/text";
import { keyLabel } from "@/lib/music/theory";

export function CoachPage() {
  const project = useProjectStore((s) => s.project);
  const analysis = useLyricsAnalysis(project?.sections);
  const ai = useAIStatus();
  const [topic, setTopic] = useState<CoachTopic>("hookWriting");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{ topic: CoachTopic; model: string; data: CoachResponse } | null>(null);

  const m = useMemo(() => (project ? measureSong(project, analysis) : null), [project, analysis]);
  if (!project || !m) return null;
  const lesson = LESSONS[topic];
  const topicFindings = m.findings.filter((f) => f.topic === topic);
  const otherFindings = m.findings.filter((f) => f.topic !== topic);

  async function ask() {
    if (!project || !m) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callAI<CoachResponse>("/api/ai/coach", {
        topic,
        context: { title: project.title, genre: project.genre, mood: project.mood, language: project.language, bpm: project.bpm, key: keyLabel(project.key, project.scale) },
        lyrics: formatLyricsForSuno(project.sections).slice(0, 12000),
        measurements: [...m.lines, ...m.findings.map((f) => `${f.title}: ${f.evidence}`)].slice(0, 60).map((s) => s.slice(0, 300)),
        question: question.trim() || undefined,
      });
      setResponse({ topic, model: res.model, data: res.result });
    } catch (err) {
      setError(err instanceof AIRequestError ? err.message : "Coach request failed.");
    } finally {
      setBusy(false);
    }
  }

  const sevIcon = (s: string) => (s === "warning" ? <TriangleExclamationPoint className="size-4 text-amber-300" /> : s === "suggestion" ? <Lightbulb className="size-4 text-mint" /> : <Info className="size-4 text-violet" />);

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={GraduationCap} title="Songwriting Coach" description="Measurements and rule-based checks of your current song, lessons with exercises, and (optionally) an AI coach that cites the same evidence." />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <Panel title="Topic">
              <div className="flex flex-wrap gap-1.5">
                {COACH_TOPICS.map((t) => (
                  <Button key={t} size="sm" variant={t === topic ? "default" : "outline"} onClick={() => setTopic(t)} aria-pressed={t === topic}>
                    {COACH_TOPIC_LABELS[t]}
                  </Button>
                ))}
              </div>
            </Panel>
            <Panel title={`Concept · ${COACH_TOPIC_LABELS[topic]}`}>
              <p className="text-sm">{lesson.concept}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {lesson.exercises.map((ex) => (
                  <div key={ex.title} className="rounded-md border border-border bg-panel p-3">
                    <div className="mb-1 text-sm font-medium">{ex.title}</div>
                    <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {ex.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={`Checks for this topic (${topicFindings.length})`}>
              {topicFindings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rule-based issues found for this topic. {otherFindings.length ? `${otherFindings.length} finding(s) under other topics are listed on the right.` : ""}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {topicFindings.map((f) => (
                    <li key={f.id} className="flex gap-2 rounded-md border border-border bg-panel p-2.5">
                      {sevIcon(f.severity)}
                      <div>
                        <div className="text-sm font-medium">{f.title}</div>
                        <p className="text-xs text-muted-foreground">{f.detail}</p>
                        <p className="mt-1 text-xs">Evidence: {f.evidence}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {ai?.configured && (
            <Panel title="AI coach">
              {ai && !ai.configured ? (
                <p className="text-sm text-muted-foreground">{ai.reason} The measurements, checks and lessons on this page work without it.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Field label="Your question (optional)">
                    <Textarea rows={2} value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why does my chorus feel weaker than the verse?" />
                  </Field>
                  <Button onClick={() => void ask()} disabled={busy || !ai?.configured} className="self-start">
                    {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Coach me on {COACH_TOPIC_LABELS[topic]}
                  </Button>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              )}
              {response && (
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
                  <div className="text-[11px] text-muted-foreground">{COACH_TOPIC_LABELS[response.topic]} · {response.model}</div>
                  <p className="text-sm">{response.data.overview}</p>
                  <ul className="flex flex-col gap-2">
                    {response.data.observations.map((o, i) => (
                      <li key={i} className="rounded-md border border-border bg-panel p-2.5">
                        <div className="text-sm font-medium">{o.title}</div>
                        <p className="text-xs text-muted-foreground">{o.detail}</p>
                        <p className="mt-1 text-xs">Evidence: {o.evidence}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 md:grid-cols-2">
                    {response.data.exercises.map((ex, i) => (
                      <div key={i} className="rounded-md border border-violet/30 bg-violet/5 p-2.5">
                        <div className="text-sm font-medium">{ex.title}</div>
                        <p className="text-xs text-muted-foreground">{ex.goal}</p>
                        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">{ex.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                      </div>
                    ))}
                  </div>
                  <p className="rounded-md bg-background/50 p-2 text-xs text-muted-foreground">{response.data.concept}</p>
                </div>
              )}
            </Panel>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <Panel title="Measurements">
              <ul className="flex flex-col gap-1.5 text-xs">
                {m.lines.map((l, i) => <li key={i} className="text-muted-foreground">{l}</li>)}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground/70">Computed by the app; syllables and rhymes are estimates.</p>
            </Panel>
            {otherFindings.length > 0 && (
              <Panel title="Other findings">
                <ul className="flex flex-col gap-2">
                  {otherFindings.map((f) => (
                    <li key={f.id} className="flex gap-2 text-xs">
                      {sevIcon(f.severity)}
                      <div>
                        <div className="font-medium">{f.title}</div>
                        <div className="text-muted-foreground">{f.evidence}</div>
                        <button type="button" className="mt-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:border-mint/60" onClick={() => setTopic(f.topic as CoachTopic)}>
                          {COACH_TOPIC_LABELS[f.topic as CoachTopic] ?? f.topic}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
