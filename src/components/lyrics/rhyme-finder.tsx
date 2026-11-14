"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Search, TriangleExclamationPoint } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDictionaryStore } from "@/stores/dictionary-store";
import { findThaiRhymes, type RhymeResult } from "@/lib/lyrics/rhyme-finder";
import { containsThai, thaiRhymeLabel, TONE_LABELS } from "@/lib/lyrics/thai";
import { THAI_WORDS, ISAN_WORDS } from "@/lib/lyrics/data/thai-words";
import { compareRhymeUnits, englishRhymeUnitFromPhones, type RhymeUnit } from "@/lib/lyrics/rhyme";
import { analyzeThaiWordForRhyme, findThaiAlliterations } from "@/lib/lyrics/rhyme-finder";

interface EnglishResponse {
  word: string;
  phones: string[] | null;
  tail: string[] | null;
  perfect: string[];
  near: string[];
  multisyllabic: string[];
}

function ResultChip({ r, onPick }: { r: RhymeResult; onPick?: (w: string) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onPick?.(r.word)}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors hover:border-mint/60",
            r.comparison.kind === "exact" || r.comparison.kind === "custom" ? "border-mint/30 bg-mint/10" : "border-border bg-card",
          )}
        >
          <span>{r.word}</span>
          {r.multi >= 2 && <span className="rounded bg-violet/25 px-1 text-[10px] text-violet">{r.multi}-syl</span>}
          {r.source === "isan" && <span className="rounded bg-amber-300/15 px-1 text-[10px] text-amber-200">Isan</span>}
          {r.source === "custom" && <span className="rounded bg-sky-300/15 px-1 text-[10px] text-sky-200">mine</span>}
          {r.source === "lyrics" && <span className="rounded bg-white/10 px-1 text-[10px] text-muted-foreground">song</span>}
          {r.comparison.uncertain && <TriangleExclamationPoint className="size-3 text-amber-300" aria-label="uncertain reading" />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <div className="font-medium">
          {r.word} — {r.syllables.map((s) => s.text).join("·")} ({r.syllables.map(thaiRhymeLabel).join(" | ")})
        </div>
        {r.meaning && <div className="text-muted-foreground">{r.meaning}</div>}
        <ul className="mt-1 list-disc pl-4">
          {r.comparison.reasons.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
          {r.multi >= 2 && <li>The last {r.multi} syllables rhyme (multisyllabic).</li>}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function RhymeFinder({
  initialQuery = "",
  lyricWords = [],
  onPick,
  compact = false,
}: {
  initialQuery?: string;
  lyricWords?: string[];
  onPick?: (word: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const entries = useDictionaryStore((s) => s.entries);
  const loadDict = useDictionaryStore((s) => s.load);
  // Results are stored with the query they belong to, so stale ones never show.
  const [lookup, setLookup] = useState<{ key: string; en: EnglishResponse | null; crossEn: string[]; error: string | null; loading: boolean }>({ key: "", en: null, crossEn: [], error: null, loading: false });
  const [prevInitial, setPrevInitial] = useState(initialQuery);
  if (prevInitial !== initialQuery) {
    setPrevInitial(initialQuery);
    setQuery(initialQuery);
  }

  useEffect(() => void loadDict(), [loadDict]);

  const q = query.trim();
  const isThai = containsThai(q);
  const thai = useMemo(() => (isThai ? findThaiRhymes(q, { custom: entries, lyricWords }) : null), [isThai, q, entries, lyricWords]);
  const allit = useMemo(() => (isThai ? findThaiAlliterations(q, { custom: entries, lyricWords }) : []), [isThai, q, entries, lyricWords]);

  // English lookups (debounced).
  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        if (!isThai && /^[a-zA-Z']{1,40}$/.test(q)) {
          setLookup({ key: q, en: null, crossEn: [], error: null, loading: true });
          const res = await fetch(`/api/rhymes/en?word=${encodeURIComponent(q.toLowerCase())}`, { signal: ctrl.signal });
          if (!res.ok) throw new Error("Lookup failed");
          setLookup({ key: q, en: (await res.json()) as EnglishResponse, crossEn: [], error: null, loading: false });
        } else if (isThai && thai?.target?.last) {
          const u = thai.target.last;
          const res = await fetch(`/api/rhymes/thai-unit?vowel=${encodeURIComponent(u.vowel)}&long=${u.long}&coda=${u.coda}`, { signal: ctrl.signal });
          const words = res.ok ? ((await res.json()) as { words: string[] }).words.slice(0, 30) : [];
          setLookup({ key: q, en: null, crossEn: words, error: null, loading: false });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setLookup({ key: q, en: null, crossEn: [], error: "English pronunciation lookup is unavailable.", loading: false });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, isThai, thai?.target?.last]);

  const current = lookup.key === q ? lookup : null;
  const en = current?.en ?? null;
  const enLoading = current?.loading ?? false;
  const enError = current?.error ?? null;
  const crossEn = current?.crossEn ?? [];

  // English query -> approximate Thai matches.
  const thaiForEnglish = useMemo(() => {
    if (!en?.phones) return [];
    const unit: RhymeUnit = englishRhymeUnitFromPhones(en.phones);
    const pool = Array.from(new Set([...THAI_WORDS, ...ISAN_WORDS.map((w) => w.word)]));
    return pool
      .map((w) => {
        const a = analyzeThaiWordForRhyme(w);
        return a.last ? { word: w, c: compareRhymeUnits(unit, a.last) } : null;
      })
      .filter((x): x is { word: string; c: ReturnType<typeof compareRhymeUnits> } => !!x && x.c.score >= 0.6)
      .slice(0, 30);
  }, [en]);

  const groups = useMemo(() => {
    const res = thai?.results ?? [];
    return [
      { key: "strong", title: "Exact rhymes", items: res.filter((r) => r.comparison.kind === "exact" || r.comparison.kind === "custom") },
      { key: "near", title: "Near rhymes", items: res.filter((r) => r.comparison.kind === "near") },
      { key: "assonance", title: "Assonance (same vowel)", items: res.filter((r) => r.comparison.kind === "assonance") },
    ];
  }, [thai]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a Thai, Isan or English word (e.g. อุดร, heart)" className="pl-8" aria-label="Word to rhyme" />
      </div>

      {!q && <p className="text-xs text-muted-foreground">Rhymes are matched by sound: vowel quality, vowel length and the final consonant sound (Thai สัมผัสสระ), or the stressed vowel and following sounds (English, CMU dictionary). Thai words also list matches with the same initial consonant sound (สัมผัสอักษร).</p>}

      {isThai && thai?.target && (
        <div className="rounded-md border border-border bg-panel p-2 text-xs">
          <div className="mb-1 flex items-center gap-1 font-medium">
            Reading of “{thai.target.word}”
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleHelp className="size-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">Rule-based estimate from Thai spelling. Hidden vowels and loanwords can be misread — add a custom dictionary entry to override.</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-1">
            {thai.target.syllables.map((s, i) => (
              <span key={i} className={cn("rounded border px-1.5 py-0.5", s.confidence < 0.7 ? "border-amber-300/50" : "border-border")}>
                {s.text} <span className="text-muted-foreground">/{thaiRhymeLabel(s)}/ · {TONE_LABELS[s.tone]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {isThai &&
        groups.map((g) =>
          g.items.length ? (
            <section key={g.key}>
              <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {g.title} <span className="text-muted-foreground/60">({g.items.length})</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {g.items.slice(0, compact ? 40 : 120).map((r) => (
                  <ResultChip key={r.word} r={r} onPick={onPick} />
                ))}
              </div>
            </section>
          ) : null,
        )}
      {isThai && allit.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Same initial sound {allit[0].label} · สัมผัสอักษร <span className="text-muted-foreground/60">({allit.length})</span>
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {allit.slice(0, compact ? 40 : 120).map((r) => (
              <Tooltip key={r.word}>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => onPick?.(r.word)} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-sm hover:border-mint/60">
                    {r.word}
                    {r.source === "isan" && <span className="rounded bg-amber-300/15 px-1 text-[10px] text-amber-200">Isan</span>}
                    {r.source === "custom" && <span className="rounded bg-sky-300/15 px-1 text-[10px] text-sky-200">mine</span>}
                    {r.source === "lyrics" && <span className="rounded bg-white/10 px-1 text-[10px] text-muted-foreground">song</span>}
                    {r.approximate && <TriangleExclamationPoint className="size-3 text-amber-300" aria-label="uncertain reading" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {r.word} — {r.syllables.map((x) => x.text).join("·")}. Starts with {r.label}, the same initial sound as “{q}”.
                  {r.meaning && <div className="text-muted-foreground">{r.meaning}</div>}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </section>
      )}
      {isThai && thai && thai.results.length === 0 && <p className="text-xs text-muted-foreground">No rhymes in the built-in, Isan, custom or song vocabulary. Add words to your custom dictionary.</p>}
      {isThai && crossEn.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">English words with a similar ending (approximate)</h4>
          <div className="flex flex-wrap gap-1.5">
            {crossEn.map((w) => (
              <button key={w} type="button" onClick={() => onPick?.(w)} className="rounded-md border border-dashed border-border px-2 py-1 text-sm hover:border-mint/60">
                {w}
              </button>
            ))}
          </div>
        </section>
      )}

      {!isThai && q && (
        <>
          {enLoading && <p className="text-xs text-muted-foreground">Looking up pronunciation…</p>}
          {enError && <p className="text-xs text-amber-200">{enError}</p>}
          {en && !en.phones && <p className="text-xs text-muted-foreground">“{q}” is not in the CMU Pronouncing Dictionary, so English rhymes can’t be computed reliably.</p>}
          {en?.phones && (
            <>
              <p className="text-xs text-muted-foreground">
                /{en.phones.join(" ")}/ · rhyme part <span className="text-foreground">{en.tail?.join(" ")}</span>. Lists include proper names from the dictionary and are not ranked by popularity.
              </p>
              {(
                [
                  ["Multisyllabic", en.multisyllabic],
                  ["Perfect rhymes", en.perfect],
                  ["Near rhymes", en.near],
                ] as const
              ).map(([title, words]) =>
                words.length ? (
                  <section key={title}>
                    <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {title} <span className="text-muted-foreground/60">({words.length})</span>
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {words.slice(0, compact ? 40 : 120).map((w) => (
                        <button key={w} type="button" onClick={() => onPick?.(w)} className="rounded-md border border-border bg-card px-2 py-1 text-sm hover:border-mint/60">
                          {w}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
              {thaiForEnglish.length > 0 && (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Thai words with a similar ending (approximate)</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {thaiForEnglish.map((x) => (
                      <Tooltip key={x.word}>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={() => onPick?.(x.word)} className="rounded-md border border-dashed border-border px-2 py-1 text-sm hover:border-mint/60">
                            {x.word}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{x.c.reasons.join(" ")}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          <TriangleExclamationPoint className="text-amber-300" /> = uncertain reading
        </Badge>
        <Badge variant="outline" className="font-normal">hover a word for the explanation</Badge>
      </div>
    </div>
  );
}
