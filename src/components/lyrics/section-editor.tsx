"use client";

import { memo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, EllipsisVertical, Plus, Scissors, Trash, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SimpleSelect } from "@/components/common/form";
import { SECTION_OPTIONS } from "@/components/common/music-options";
import type { SectionType, SongSection } from "@/lib/project/schema";
import type { LineAnalysis, SectionAnalysis } from "@/lib/lyrics/analysis";
import { rhymeColor } from "@/lib/lyrics/analysis";
import { parseOverrideText, tokensToOverrideText, type SyllableToken } from "@/lib/lyrics/syllables";
import { TONE_LABELS, CODA_LABELS } from "@/lib/lyrics/thai";
import { useProjectStore } from "@/stores/project-store";
import { createLine, createSection, uid } from "@/lib/project/factory";

export interface DisplayOptions {
  syllables: boolean;
  internal: boolean;
  endRhymes: boolean;
  alliteration: boolean;
}

const EMPTY: Record<string, number> = {};

function focusLine(id: string, caret: "start" | "end" = "end") {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-line-input="${id}"]`);
    if (!el) return;
    el.focus();
    const pos = caret === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
  });
}

function SyllableChip({ t, group, allit, isEnd, endColor, onPick }: { t: SyllableToken; group?: number; allit?: number; isEnd: boolean; endColor?: string; onPick: (word: string) => void }) {
  const color = group !== undefined ? rhymeColor(group) : undefined;
  const allitColor = allit !== undefined ? rhymeColor(allit + 3) : undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onPick(t.word)}
          className={cn(
            "rounded px-1 py-px text-[11px] leading-4 transition-colors",
            t.wordStart && "ml-1.5 first:ml-0",
            t.confidence < 0.6 ? "border border-dashed border-amber-300/50" : "border border-transparent",
            t.stressed && "font-semibold",
          )}
          style={{
            background: color ? `color-mix(in oklch, ${color} 22%, transparent)` : "oklch(1 0 0 / 5%)",
            color: color ?? undefined,
            boxShadow: isEnd && endColor ? `inset 0 -2px 0 ${endColor}` : undefined,
            textDecorationLine: allitColor ? "overline" : undefined,
            textDecorationColor: allitColor,
            textDecorationThickness: allitColor ? "2px" : undefined,
          }}
        >
          {t.text}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        <div className="font-medium">
          {t.text} <span className="text-muted-foreground">in “{t.word}”</span>
        </div>
        {t.thai ? (
          <div>
            /{t.rhyme?.label}/ · {TONE_LABELS[t.thai.tone]} · {CODA_LABELS[t.thai.coda]}
            <div className="text-muted-foreground">
              rule: {t.thai.rule} · confidence {Math.round(t.confidence * 100)}%
            </div>
          </div>
        ) : t.rhyme ? (
          <div>
            {t.rhyme.label} {t.rhyme.source === "spelling" && <span className="text-amber-200">(spelling estimate)</span>}
          </div>
        ) : null}
        {t.onset && (
          <div className="text-muted-foreground">
            initial sound {t.onset.label}
            {t.onset.approximate && " (approximate)"}
            {allit !== undefined && <span style={{ color: allitColor }}> · alliterates in this line</span>}
          </div>
        )}
        {t.manual && <div className="text-sky-200">manual segmentation</div>}
        <div className="mt-1 text-muted-foreground">Click to find rhymes for this word.</div>
      </TooltipContent>
    </Tooltip>
  );
}

const LineRow = memo(function LineRow({
  sectionId,
  lineIndex,
  lineId,
  text,
  hasOverride,
  analysis,
  internal,
  alliteration,
  display,
  onPickWord,
  onFocusLine,
}: {
  sectionId: string;
  lineIndex: number;
  lineId: string;
  text: string;
  hasOverride: boolean;
  analysis: LineAnalysis | undefined;
  internal: Record<string, number>;
  alliteration: Record<string, number>;
  display: DisplayOptions;
  onPickWord: (w: string) => void;
  onFocusLine: (lineId: string) => void;
}) {
  const update = useProjectStore((s) => s.update);
  const [editingSyl, setEditingSyl] = useState(false);
  const [sylText, setSylText] = useState("");
  const endColor = analysis?.endGroup != null && display.endRhymes ? rhymeColor(analysis.endGroup) : undefined;

  const setText = (value: string) =>
    update(
      (d) => {
        const sec = d.sections.find((s) => s.id === sectionId);
        const ln = sec?.lines.find((l) => l.id === lineId);
        if (ln) ln.text = value;
      },
      { coalesce: `line-${lineId}` },
    );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const before = el.value.slice(0, el.selectionStart ?? el.value.length);
      const after = el.value.slice(el.selectionEnd ?? el.value.length);
      const newLine = createLine(after);
      update((d) => {
        const sec = d.sections.find((s) => s.id === sectionId)!;
        const idx = sec.lines.findIndex((l) => l.id === lineId);
        sec.lines[idx].text = before;
        sec.lines.splice(idx + 1, 0, newLine);
      });
      focusLine(newLine.id, "start");
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      const sec = useProjectStore.getState().project?.sections.find((s) => s.id === sectionId);
      if (!sec) return;
      const idx = sec.lines.findIndex((l) => l.id === lineId);
      if (idx <= 0) return;
      e.preventDefault();
      const prev = sec.lines[idx - 1];
      const prevLen = prev.text.length;
      update((d) => {
        const s = d.sections.find((x) => x.id === sectionId)!;
        s.lines[idx - 1].text += s.lines[idx].text;
        s.lines.splice(idx, 1);
      });
      requestAnimationFrame(() => {
        const p = document.querySelector<HTMLInputElement>(`[data-line-input="${prev.id}"]`);
        p?.focus();
        p?.setSelectionRange(prevLen, prevLen);
      });
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const all = Array.from(document.querySelectorAll<HTMLInputElement>("[data-line-input]"));
      const i = all.indexOf(el);
      const next = all[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    if (!pasted.includes("\n")) return;
    e.preventDefault();
    const el = e.currentTarget;
    const parts = pasted.replace(/\r/g, "").split("\n");
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const after = el.value.slice(el.selectionEnd ?? el.value.length);
    const extra = parts.slice(1).map((p, i) => createLine(i === parts.length - 2 ? p + after : p));
    update((d) => {
      const sec = d.sections.find((s) => s.id === sectionId)!;
      const idx = sec.lines.findIndex((l) => l.id === lineId);
      sec.lines[idx].text = before + parts[0] + (parts.length === 1 ? after : "");
      sec.lines.splice(idx + 1, 0, ...extra);
    });
    if (extra.length) focusLine(extra[extra.length - 1].id);
  }

  const tokens = analysis?.tokens ?? [];
  return (
    <div className="group/line flex gap-2 py-1" data-line-id={lineId}>
      <div className="w-6 shrink-0 pt-1.5 text-right text-[10px] text-muted-foreground/60 tabular">{lineIndex + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            data-line-input={lineId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => onFocusLine(lineId)}
            placeholder={lineIndex === 0 ? "Write a line… (Enter for a new line)" : ""}
            aria-label={`Line ${lineIndex + 1}`}
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[15px] outline-none hover:border-border focus:border-ring focus:bg-input/20"
            style={endColor ? { boxShadow: `inset 3px 0 0 ${endColor}` } : undefined}
          />
          <div className="flex shrink-0 items-center gap-1 text-[11px] tabular">
            {analysis?.letter && (
              <span className="grid size-5 place-items-center rounded font-semibold" style={{ color: endColor ?? "var(--muted-foreground)", background: endColor ? `color-mix(in oklch, ${endColor} 15%, transparent)` : "oklch(1 0 0 / 5%)" }} title="Rhyme scheme letter">
                {analysis.letter}
              </span>
            )}
            <span className={cn("w-8 text-right", hasOverride ? "text-sky-200" : "text-muted-foreground")} title={hasOverride ? "Syllables (manual)" : "Syllables (estimated)"}>
              {tokens.length}
            </span>
          </div>
        </div>
        {display.syllables && tokens.length > 0 && !editingSyl && (
          <div className="mt-0.5 flex flex-wrap items-center gap-y-1 px-2">
            {tokens.map((t) => (
              <SyllableChip
                key={t.id}
                t={t}
                group={display.internal ? internal[t.id] : undefined}
                allit={display.alliteration ? alliteration[t.id] : undefined}
                isEnd={analysis?.endToken?.id === t.id}
                endColor={endColor}
                onPick={onPickWord}
              />
            ))}
            <button
              type="button"
              className="ml-2 text-[10px] text-muted-foreground opacity-0 group-hover/line:opacity-100 hover:text-foreground focus:opacity-100"
              onClick={() => {
                setSylText(tokensToOverrideText(tokens));
                setEditingSyl(true);
              }}
            >
              <Scissors className="mr-0.5 inline size-3" />
              edit syllables
            </button>
          </div>
        )}
        {editingSyl && (
          <form
            className="mt-1 flex items-center gap-1.5 px-2"
            onSubmit={(e) => {
              e.preventDefault();
              const parts = parseOverrideText(sylText);
              update((d) => {
                const ln = d.sections.find((s) => s.id === sectionId)?.lines.find((l) => l.id === lineId);
                if (ln) ln.syllableOverride = parts;
              });
              setEditingSyl(false);
            }}
          >
            <Input autoFocus value={sylText} onChange={(e) => setSylText(e.target.value)} className="h-7 text-sm" aria-label="Manual syllables" placeholder="อุ-ดร ออน-ซอน (hyphen between syllables)" />
            <Button size="xs" type="submit">Save</Button>
            {hasOverride && (
              <Button
                size="xs"
                variant="ghost"
                type="button"
                onClick={() => {
                  update((d) => {
                    const ln = d.sections.find((s) => s.id === sectionId)?.lines.find((l) => l.id === lineId);
                    if (ln) ln.syllableOverride = null;
                  });
                  setEditingSyl(false);
                }}
              >
                <Undo2 /> Auto
              </Button>
            )}
            <Button size="xs" variant="ghost" type="button" onClick={() => setEditingSyl(false)}>
              Cancel
            </Button>
          </form>
        )}
      </div>
    </div>
  );
});

export function SectionEditor({
  section,
  index,
  total,
  analysis,
  display,
  onPickWord,
  onFocusLine,
}: {
  section: SongSection;
  index: number;
  total: number;
  analysis: SectionAnalysis | undefined;
  display: DisplayOptions;
  onPickWord: (w: string) => void;
  onFocusLine: (lineId: string, sectionId: string) => void;
}) {
  const update = useProjectStore((s) => s.update);
  const byLine = new Map((analysis?.lines ?? []).map((l) => [l.lineId, l]));
  const move = (dir: -1 | 1) =>
    update((d) => {
      const i = d.sections.findIndex((s) => s.id === section.id);
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return;
      [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]];
    });

  return (
    <section id={section.id} className="scroll-mt-4 rounded-lg border border-border bg-card/60">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SimpleSelect
          size="sm"
          className="w-32"
          value={section.type}
          ariaLabel="Section type"
          options={SECTION_OPTIONS}
          onChange={(v: SectionType) =>
            update((d) => {
              const s = d.sections.find((x) => x.id === section.id)!;
              s.type = v;
            })
          }
        />
        <Input
          value={section.label}
          maxLength={80}
          onChange={(e) =>
            update(
              (d) => {
                d.sections.find((x) => x.id === section.id)!.label = e.target.value;
              },
              { coalesce: `label-${section.id}` },
            )
          }
          className="h-7 w-40 text-sm font-medium"
          aria-label="Section label"
        />
        {analysis && (
          <span className="text-[11px] text-muted-foreground">
            scheme <span className="font-mono text-foreground/80">{analysis.scheme || "—"}</span> · avg {analysis.averageSyllables.toFixed(1)} syl
            {analysis.syllableSpread > 3 && <span className="text-amber-200"> · spread {analysis.syllableSpread}</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button size="icon-xs" variant="ghost" aria-label="Move section up" disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUp />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Move section down" disabled={index === total - 1} onClick={() => move(1)}>
            <ArrowDown />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Section actions">
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  update((d) => {
                    const i = d.sections.findIndex((s) => s.id === section.id);
                    const copy = structuredClone(d.sections[i]);
                    copy.id = uid("sec");
                    copy.label = `${copy.label} (copy)`;
                    copy.lines = copy.lines.map((l) => ({ ...l, id: uid("ln") }));
                    d.sections.splice(i + 1, 0, copy);
                  })
                }
              >
                <Copy /> Duplicate section
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  update((d) => {
                    const i = d.sections.findIndex((s) => s.id === section.id);
                    d.sections.splice(i + 1, 0, createSection("verse"));
                  })
                }
              >
                <Plus /> Insert section below
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => update((d) => void (d.sections = d.sections.filter((s) => s.id !== section.id)))}>
                <Trash /> Delete section (undo with Ctrl+Z)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="px-1 py-1.5">
        {section.lines.map((l, i) => (
          <LineRow
            key={l.id}
            sectionId={section.id}
            lineIndex={i}
            lineId={l.id}
            text={l.text}
            hasOverride={!!l.syllableOverride}
            analysis={byLine.get(l.id)}
            internal={analysis?.internal ?? {}}
            alliteration={analysis?.alliteration ?? EMPTY}
            display={display}
            onPickWord={onPickWord}
            onFocusLine={(id) => onFocusLine(id, section.id)}
          />
        ))}
        <button
          type="button"
          className="ml-8 mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => {
            const ln = createLine();
            update((d) => void d.sections.find((s) => s.id === section.id)!.lines.push(ln));
            focusLine(ln.id);
          }}
        >
          <Plus className="size-3" /> Add line
        </button>
      </div>
    </section>
  );
}
