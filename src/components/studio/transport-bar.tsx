"use client";

import Link from "next/link";
import { Circle, PanelLeft, PanelRight, Pause, Play, Repeat, Square, Timer, TriangleExclamationPoint, Volume2, X } from "lucide-react";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTransportStore } from "@/stores/transport-store";
import { useProjectStore } from "@/stores/project-store";
import { endPreview, setLoop, setMix, stopPlayback, toggleMetronome, togglePlay } from "@/lib/audio/transport-actions";
import { formatBarBeat, formatClock, ticksToSeconds } from "@/lib/music/timing";
import { projectLengthTicks } from "@/lib/project/factory";
import { keyLabel } from "@/lib/music/theory";

function TBtn({
  label,
  shortcut,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(active && "bg-mint/15 text-mint hover:bg-mint/20 hover:text-mint", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function TransportBar({ showPanelToggles = false }: { showPanelToggles?: boolean }) {
  const layout = useLayoutStore();
  const project = useProjectStore((s) => s.project);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const pos = useTransportStore((s) => s.positionTicks);
  const metronome = useTransportStore((s) => s.metronome);
  const loop = useTransportStore((s) => s.loop);
  const mix = useTransportStore((s) => s.mix);
  const previewLabel = useTransportStore((s) => s.previewLabel);
  const recordHandler = useTransportStore((s) => s.recordHandler);
  const isRecording = useTransportStore((s) => s.isRecording);
  const audioError = useTransportStore((s) => s.audioError);
  if (!project) return null;

  const toggleLoop = () => {
    const end = loop.enabled ? loop.end : Math.max(loop.end, projectLengthTicks(project));
    setLoop({ ...loop, enabled: !loop.enabled, end });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-sidebar px-2 py-1.5 md:px-3" role="toolbar" aria-label="Transport">
      <div className="flex items-center gap-0.5">
        <TBtn label={isPlaying ? "Pause" : "Play"} shortcut="Space" onClick={() => void togglePlay()} active={isPlaying}>
          {isPlaying ? <Pause /> : <Play />}
        </TBtn>
        <TBtn label="Stop and return to start" shortcut="Home" onClick={stopPlayback}>
          <Square />
        </TBtn>
        {recordHandler ? (
          <TBtn label={isRecording ? "Stop recording" : "Record"} onClick={recordHandler} active={isRecording} className={cn(isRecording && "text-rose-300")}>
            <Circle className={cn(isRecording ? "fill-rose-400 text-rose-400" : "text-rose-300")} />
          </TBtn>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild aria-label="Open Vocal Recorder">
                <Link href={`/studio/${project.id}/record`}>
                  <Circle className="text-rose-300" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Record (opens Vocal Recorder)</TooltipContent>
          </Tooltip>
        )}
        <TBtn label={metronome ? "Metronome on" : "Metronome off"} shortcut="M" onClick={toggleMetronome} active={metronome}>
          <Timer />
        </TBtn>
        <TBtn label={loop.enabled ? "Loop on" : "Loop off"} shortcut="L" onClick={toggleLoop} active={loop.enabled}>
          <Repeat />
        </TBtn>
      </div>

      <div className="flex items-baseline gap-3 rounded-md bg-background/60 px-3 py-1 font-mono text-sm tabular" aria-live="off">
        <span className="text-mint" title="Bar.Beat.Sixteenth">{formatBarBeat(pos, project.timeSignature)}</span>
        <span className="text-xs text-muted-foreground">{formatClock(ticksToSeconds(pos, project.bpm))}</span>
      </div>

      <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        <span className="tabular">{project.bpm} BPM</span>
        <span>·</span>
        <span>
          {project.timeSignature.numerator}/{project.timeSignature.denominator}
        </span>
        <span>·</span>
        <span>{keyLabel(project.key, project.scale)}</span>
      </div>

      {previewLabel && (
        <div className="flex items-center gap-1 rounded-md border border-violet/40 bg-violet/10 px-2 py-0.5 text-xs">
          <span className="text-violet">Auditioning:</span> <span className="max-w-48 truncate">{previewLabel}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Stop audition and return to project" onClick={endPreview}>
            <X />
          </Button>
        </div>
      )}

      {audioError && (
        <span className="flex items-center gap-1 text-xs text-amber-200">
          <TriangleExclamationPoint className="size-3.5" /> {audioError}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="flex w-36 items-center gap-2">
          <Volume2 className="size-4 shrink-0 text-muted-foreground" />
          <Slider value={[mix.master]} min={0} max={1} step={0.01} onValueChange={(v) => setMix({ master: v[0] })} aria-label="Master volume" />
        </div>
        {showPanelToggles && (
          <div className="flex items-center">
            <TBtn label={layout.leftOpen ? "Hide song panel" : "Show song panel"} onClick={() => layout.toggle("left")} active={layout.leftOpen}>
              <PanelLeft />
            </TBtn>
            <TBtn label={layout.rightOpen ? "Hide inspector" : "Show inspector"} onClick={() => layout.toggle("right")} active={layout.rightOpen}>
              <PanelRight />
            </TBtn>
          </div>
        )}
      </div>
    </div>
  );
}
