"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Info, LayoutDashboard, TriangleExclamationPoint } from "lucide-react";
import { PageHeader, Panel } from "@/components/common/form";
import { ProjectList, useProjectSummaries } from "@/components/project/project-list";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { PRIMARY_NAV, TOOL_NAV, toolHref } from "@/components/shell/nav";
import { useAIStatus } from "@/hooks/use-ai";
import { cn } from "@/lib/utils";
import { useClientValue } from "@/hooks/use-client-value";

interface Capability {
  label: string;
  ok: boolean;
  detail: string;
}

let capsCache: Capability[] | null = null;

function readCapabilities(): Capability[] {
  if (capsCache) return capsCache;
  const thaiSegmenter = (() => {
    try {
      const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
      if (!Seg) return false;
      return Array.from(new Seg("th", { granularity: "word" }).segment("ฉันรักเธอ")).length > 1;
    } catch {
      return false;
    }
  })();
  capsCache = [
    { label: "Local storage (IndexedDB)", ok: typeof indexedDB !== "undefined", detail: "Projects and recordings are saved in this browser." },
    { label: "Web Audio", ok: typeof AudioContext !== "undefined", detail: "Playback, metronome and audio analysis." },
    { label: "Microphone recording", ok: typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia, detail: "Vocal Recorder and Hum to Melody." },
    { label: "Thai word segmentation", ok: thaiSegmenter, detail: thaiSegmenter ? "Intl.Segmenter with Thai dictionary available." : "Not available — syllables use the rule-based parser on whole runs." },
    { label: "Web MIDI", ok: "requestMIDIAccess" in navigator, detail: "Supported by this browser (MIDI files are always available)." },
  ];
  return capsCache;
}

function useCapabilities(): Capability[] | null {
  return useClientValue<Capability[] | null>(readCapabilities, null);
}

export function Dashboard() {
  const ai = useAIStatus();
  const caps = useCapabilities();
  const { items } = useProjectSummaries();
  const latest = items?.[0]?.id ?? null;
  const tools = [...PRIMARY_NAV, ...TOOL_NAV].filter((n) => n.tool);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Write, analyse, sketch melodies and flows, record ideas, and export to your DAW."
        actions={<NewProjectDialog />}
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <Panel title="Recent songs" actions={<Link href="/projects" className="text-xs text-mint hover:underline">All projects</Link>}>
              <ProjectList limit={6} compact />
            </Panel>
            <Panel title={latest ? `Tools · ${items?.[0]?.title}` : "Tools"}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((t) => (
                  <Link
                    key={t.label}
                    href={toolHref(latest, t.tool!)}
                    className="group flex items-start gap-3 rounded-md border border-border bg-panel p-3 transition-colors hover:border-mint/40"
                  >
                    <t.icon className="mt-0.5 size-4 shrink-0 text-mint" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {t.label}
                        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
              {!latest && <p className="mt-3 text-xs text-muted-foreground">Tools open the most recent song. Create a song first.</p>}
            </Panel>
          </div>
          <div className="flex flex-col gap-4">
            {ai?.configured && (
            <Panel title="AI provider">
              {ai === null ? (
                <p className="text-sm text-muted-foreground">Checking…</p>
              ) : ai.configured ? (
                <div className="flex items-start gap-2 text-sm">
                  <CircleCheck className="mt-0.5 size-4 text-mint" />
                  <div>
                    <div>{ai.provider}</div>
                    <div className="text-xs text-muted-foreground">Model: {ai.model}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm">
                  <Info className="mt-0.5 size-4 text-violet" />
                  <div>
                    <div>Not configured</div>
                    <p className="text-xs text-muted-foreground">
                      {ai.reason} Rule-based tools (syllables, rhymes, melody generator, flow, coach measurements) work without it.
                    </p>
                  </div>
                </div>
              )}
            </Panel>
            )}
            <Panel title="This browser">
              <ul className="flex flex-col gap-2">
                {(caps ?? []).map((c) => (
                  <li key={c.label} className="flex items-start gap-2 text-sm">
                    {c.ok ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-mint" />
                    ) : (
                      <TriangleExclamationPoint className="mt-0.5 size-4 shrink-0 text-amber-300" />
                    )}
                    <div>
                      <div className={cn(!c.ok && "text-amber-200")}>{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
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
