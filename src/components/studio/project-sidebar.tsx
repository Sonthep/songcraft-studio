"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, Plus, RotateCcw, TriangleExclamationPoint, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { setMix, toggleMetronome } from "@/lib/audio/transport-actions";
import { PRIMARY_NAV, TOOL_NAV } from "@/components/shell/nav";
import { SECTION_LABELS, SECTION_TYPES, type SectionType } from "@/lib/project/schema";
import { createSection } from "@/lib/project/factory";
import { relativeTime } from "@/components/project/project-list";

export function SaveIndicator() {
  const saveState = useProjectStore((s) => s.saveState);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const saveError = useProjectStore((s) => s.saveError);
  const save = useProjectStore((s) => s.save);
  if (saveState === "saving")
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground" role="status">
        <LoaderCircle className="size-3 animate-spin" /> Saving…
      </span>
    );
  if (saveState === "dirty")
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-200" role="status">
        <span className="size-1.5 rounded-full bg-amber-300" /> Unsaved changes
      </span>
    );
  if (saveState === "error")
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => void save()} className="flex items-center gap-1 text-[11px] text-destructive" role="status">
            <TriangleExclamationPoint className="size-3" /> Save failed — retry
          </button>
        </TooltipTrigger>
        <TooltipContent>{saveError}</TooltipContent>
      </Tooltip>
    );
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground" role="status">
      <CircleCheck className="size-3 text-mint" /> Saved {lastSavedAt ? relativeTime(lastSavedAt) : ""}
    </span>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-center justify-between px-3">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">{children}</h3>
      {action}
    </div>
  );
}

function TrackRow({
  label,
  detail,
  muted,
  onToggleMute,
  volume,
  onVolume,
  color,
}: {
  label: string;
  detail: string;
  muted: boolean;
  onToggleMute: () => void;
  volume: number;
  onVolume: (v: number) => void;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md px-3 py-2 hover:bg-sidebar-accent/50">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="flex-1 truncate text-sm">{label}</span>
        <span className="text-[11px] text-muted-foreground">{detail}</span>
        <Button variant="ghost" size="icon-xs" onClick={onToggleMute} aria-label={muted ? `Unmute ${label}` : `Mute ${label}`} aria-pressed={muted}>
          {muted ? <VolumeX className="text-muted-foreground" /> : <Volume2 />}
        </Button>
      </div>
      <Slider value={[volume]} min={0} max={1} step={0.01} onValueChange={(v) => onVolume(v[0])} aria-label={`${label} volume`} />
    </div>
  );
}

export function ProjectSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const mix = useTransportStore((s) => s.mix);
  const metronome = useTransportStore((s) => s.metronome);
  const pathname = usePathname();
  const router = useRouter();
  if (!project) return null;
  const base = `/studio/${project.id}`;
  const tools = [...PRIMARY_NAV, ...TOOL_NAV].filter((n) => n.tool);

  function addSection(type: SectionType) {
    const sec = createSection(type);
    update((d) => {
      d.sections.push(sec);
    });
    router.push(`${base}/lyrics#${sec.id}`);
    onNavigate?.();
  }

  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto pb-4">
      <div className="border-b border-border px-3 py-3">
        <div className="truncate text-sm font-semibold" title={project.title}>
          {project.title}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <SaveIndicator />
          <UndoRedo />
        </div>
      </div>

      <SectionTitle>Tools</SectionTitle>
      <nav aria-label="Song tools" className="flex flex-col px-1.5">
        {tools.map((t) => {
          const href = `${base}/${t.tool}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={t.tool}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <t.icon className={cn("size-3.5", active ? "text-mint" : "text-muted-foreground")} />
              <span className="truncate">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <SectionTitle
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Add section">
                <Plus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SECTION_TYPES.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => addSection(t)}>
                  {SECTION_LABELS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        Song sections
      </SectionTitle>
      <ul className="flex flex-col px-1.5">
        {project.sections.map((s) => {
          const lines = s.lines.filter((l) => l.text.trim()).length;
          return (
            <li key={s.id}>
              <Link
                href={`${base}/lyrics#${s.id}`}
                onClick={onNavigate}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-sidebar-accent"
              >
                <span className="truncate">{s.label}</span>
                <span className="text-[11px] text-muted-foreground">{lines} ln</span>
              </Link>
            </li>
          );
        })}
        {project.sections.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">No sections yet.</li>}
      </ul>

      <SectionTitle>Tracks</SectionTitle>
      <div className="flex flex-col px-1.5">
        <TrackRow
          label="Melody"
          detail={`${project.notes.length} notes`}
          color="var(--mint)"
          muted={mix.melodyMuted}
          onToggleMute={() => setMix({ melodyMuted: !mix.melodyMuted })}
          volume={mix.melody}
          onVolume={(v) => setMix({ melody: v })}
        />
        <TrackRow
          label="Chords"
          detail={`${project.chords.length} chords`}
          color="var(--violet)"
          muted={mix.chordsMuted}
          onToggleMute={() => setMix({ chordsMuted: !mix.chordsMuted })}
          volume={mix.chords}
          onVolume={(v) => setMix({ chords: v })}
        />
        <TrackRow
          label="Metronome"
          detail={metronome ? "on" : "off"}
          color="var(--playhead)"
          muted={!metronome}
          onToggleMute={toggleMetronome}
          volume={mix.metronome}
          onVolume={(v) => setMix({ metronome: v })}
        />
        <Link
          href={`${base}/record`}
          onClick={onNavigate}
          className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/50"
        >
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-rose-300" /> Audio
          </span>
          <span className="text-[11px] text-muted-foreground">{project.audioAssets.length} files</span>
        </Link>
      </div>
    </div>
  );
}

function UndoRedo() {
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" disabled={!canUndo} onClick={undo} aria-label="Undo">
            <RotateCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" disabled={!canRedo} onClick={redo} aria-label="Redo">
            <RotateCcw className="-scale-x-100" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
    </div>
  );
}
