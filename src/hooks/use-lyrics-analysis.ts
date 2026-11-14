"use client";

import { useEffect, useMemo, useState } from "react";
import type { SongSection } from "@/lib/project/schema";
import { analyzeLyrics, type LyricsAnalysis } from "@/lib/lyrics/analysis";
import { englishWordsIn, type PronunciationMap } from "@/lib/lyrics/syllables";
import { useDictionaryStore } from "@/stores/dictionary-store";
import type { CustomIndex } from "@/lib/lyrics/custom-dictionary";

/** Module-level cache of English pronunciations fetched from /api/phonetics. */
const pronCache: PronunciationMap = {};
const inflight = new Set<string>();

async function fetchPronunciations(words: string[]): Promise<boolean> {
  const missing = words.filter((w) => !(w in pronCache) && !inflight.has(w));
  if (!missing.length) return false;
  missing.forEach((w) => inflight.add(w));
  try {
    const res = await fetch("/api/phonetics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ words: missing.slice(0, 2000) }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { pronunciations: PronunciationMap };
    Object.assign(pronCache, json.pronunciations);
    return true;
  } catch {
    return false;
  } finally {
    missing.forEach((w) => inflight.delete(w));
  }
}

export function usePronunciations(texts: string[]): { pron: PronunciationMap; version: number } {
  const [version, setVersion] = useState(0);
  const key = texts.join("\n");
  useEffect(() => {
    const words = englishWordsIn(key.split("\n"));
    const t = setTimeout(() => {
      fetchPronunciations(words).then((changed) => changed && setVersion((v) => v + 1));
    }, 300);
    return () => clearTimeout(t);
  }, [key]);
  return { pron: pronCache, version };
}

/** Full lyric analysis (syllables, rhymes, repetition) for the given sections. */
export function useLyricsAnalysis(sections: SongSection[] | undefined): LyricsAnalysis | null {
  const loadDict = useDictionaryStore((s) => s.load);
  const index = useDictionaryStore((s) => s.index);
  useEffect(() => {
    void loadDict();
  }, [loadDict]);
  const texts = useMemo(() => (sections ?? []).flatMap((s) => s.lines.map((l) => l.text)), [sections]);
  const { pron, version } = usePronunciations(texts);
  return useMemo(() => {
    if (!sections) return null;
    return cachedAnalyze(sections, pron, version, index);
  }, [sections, pron, version, index]);
}

/** Several components analyse the same sections; share one result per (sections, pronunciations, dictionary). */
const analysisCache: { key: [SongSection[], number, CustomIndex] | null; result: LyricsAnalysis | null } = { key: null, result: null };

function cachedAnalyze(sections: SongSection[], pron: PronunciationMap, version: number, index: CustomIndex): LyricsAnalysis {
  const k = analysisCache.key;
  if (k && k[0] === sections && k[1] === version && k[2] === index && analysisCache.result) return analysisCache.result;
  const result = analyzeLyrics(sections, pron, index);
  analysisCache.key = [sections, version, index];
  analysisCache.result = result;
  return result;
}
