"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PanelLeft, PanelRight, LoaderCircle, TriangleExclamationPoint } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useAutosave } from "@/hooks/use-autosave";
import { useTransportSync } from "@/hooks/use-transport-sync";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLayoutStore } from "@/stores/layout-store";
import { setLoop, setMix, stopPlayback, toggleMetronome, togglePlay } from "@/lib/audio/transport-actions";
import { DEFAULT_SETTINGS, loadSettings } from "@/lib/settings";
import { projectLengthTicks } from "@/lib/project/factory";
import { ProjectSidebar } from "./project-sidebar";
import { Inspector } from "./inspector";
import { TransportBar } from "./transport-bar";

export function StudioWorkspace({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const load = useProjectStore((s) => s.load);
  const loadState = useProjectStore((s) => s.loadState);
  const loadError = useProjectStore((s) => s.loadError);
  const project = useProjectStore((s) => s.project);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const layout = useLayoutStore();
  useEffect(() => layout.hydrate(), [layout]);

  useEffect(() => {
    if (projectId) void load(projectId);
  }, [projectId, load]);

  const [autosaveDelay, setAutosaveDelay] = useState(DEFAULT_SETTINGS.autosaveDelayMs);
  useEffect(() => {
    void loadSettings().then((st) => {
      setMix({ master: st.masterVolume, melody: st.melodyVolume, chords: st.chordVolume, metronome: st.metronomeVolume });
      setAutosaveDelay(st.autosaveDelayMs);
    });
  }, []);
  useAutosave(autosaveDelay);
  useTransportSync();

  useShortcuts([
    { combo: "space", handler: () => void togglePlay() },
    { combo: "home", handler: () => stopPlayback() },
    { combo: "m", handler: () => toggleMetronome() },
    {
      combo: "l",
      handler: () => {
        const s = useTransportStore.getState();
        const p = useProjectStore.getState().project;
        const end = p ? projectLengthTicks(p) : s.loop.end;
        setLoop({ ...s.loop, enabled: !s.loop.enabled, end: s.loop.enabled ? s.loop.end : Math.max(s.loop.end, end) });
      },
    },
    { combo: "mod+z", handler: () => useProjectStore.getState().undo() },
    { combo: "mod+shift+z", handler: () => useProjectStore.getState().redo() },
    { combo: "mod+y", handler: () => useProjectStore.getState().redo() },
    {
      combo: "mod+s",
      allowInInputs: true,
      handler: () => {
        void useProjectStore
          .getState()
          .save()
          .then(() => {
            const st = useProjectStore.getState().saveState;
            if (st === "saved") toast.success("Saved");
          });
      },
    },
  ]);

  if (loadState === "loading" || loadState === "idle") {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" /> Opening song…
        </span>
      </div>
    );
  }
  if (loadState === "notfound" || loadState === "error" || !project) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <TriangleExclamationPoint className="mx-auto mb-2 size-6 text-amber-300" />
          <div className="text-sm font-medium">{loadState === "notfound" ? "Song not found" : "Could not open this song"}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {loadState === "notfound" ? "It may have been deleted, or it was created in another browser." : loadError}
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/projects">Go to projects</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!desktop && (
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-panel px-2">
          <Button variant="ghost" size="sm" onClick={() => setLeftOpen(true)}>
            <PanelLeft /> Song
          </Button>
          <span className="truncate text-sm font-medium">{project.title}</span>
          <Button variant="ghost" size="sm" onClick={() => setRightOpen(true)}>
            Inspector <PanelRight />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {desktop ? (
          <ResizablePanelGroup key={`${layout.leftOpen}-${layout.rightOpen}`} orientation="horizontal">
            {layout.leftOpen && (
              <>
                <ResizablePanel id="left" defaultSize={232} minSize={180} maxSize={380} className="bg-panel">
                  <ProjectSidebar />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}
            <ResizablePanel id="center" minSize={360}>
              <div className="@container h-full min-w-0 overflow-hidden">{children}</div>
            </ResizablePanel>
            {layout.rightOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel id="right" defaultSize={296} minSize={240} maxSize={440} className="bg-panel">
                  <Inspector />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <div className="@container h-full overflow-hidden">{children}</div>
        )}
      </div>
      <TransportBar showPanelToggles={desktop} />
      {!desktop && (
        <>
          <Dialog open={leftOpen} onOpenChange={setLeftOpen}>
            <DialogContent className="h-[85dvh] max-w-sm overflow-hidden p-0">
              <DialogTitle className="sr-only">Song panel</DialogTitle>
              <ProjectSidebar onNavigate={() => setLeftOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={rightOpen} onOpenChange={setRightOpen}>
            <DialogContent className="h-[85dvh] max-w-sm overflow-hidden p-0">
              <DialogTitle className="sr-only">Inspector</DialogTitle>
              <Inspector />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
