import type { Project, SongSection, SunoDraft } from "@/lib/project/schema";
import { LANGUAGE_LABELS, SECTION_LABELS } from "@/lib/project/schema";
import { chordSymbol, keyLabel, prefersFlats } from "@/lib/music/theory";
import { ticksPerBar } from "@/lib/music/timing";

const SUNO_TAG: Record<SongSection["type"], string> = {
  intro: "Intro",
  verse: "Verse",
  preChorus: "Pre-Chorus",
  chorus: "Chorus",
  hook: "Hook",
  bridge: "Bridge",
  rapVerse: "Rap Verse",
  outro: "Outro",
};

/** Lyrics with [Section] tags, the structure-tag convention used by Suno and similar tools. */
export function formatLyricsForSuno(sections: SongSection[]): string {
  const counts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const s of sections) totals[s.type] = (totals[s.type] ?? 0) + 1;
  return sections
    .map((s) => {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
      const numbered = totals[s.type] > 1 && (s.type === "verse" || s.type === "rapVerse") ? ` ${counts[s.type]}` : "";
      const body = s.lines.map((l) => l.text.trim()).filter(Boolean).join("\n");
      return `[${SUNO_TAG[s.type]}${numbered}]\n${body}`;
    })
    .join("\n\n");
}

const GENRE_HINTS: Record<string, { genre: string; vocals: string; arrangement: string }> = {
  "R&B": {
    genre: "Emotional R&B, smooth contemporary R&B",
    vocals: "Expressive vocal, restrained verses, soulful runs in the chorus, intimate close-mic delivery",
    arrangement: "Warm electric piano, atmospheric pads, soft drums, deep subtle bass",
  },
  "Melodic Rap": {
    genre: "Melodic rap, melodic hip-hop",
    vocals: "Half-sung rap delivery, auto-tuned melodic hooks, rhythmic verses",
    arrangement: "Dark trap drums, 808 bass, ambient guitar or piano loop",
  },
  "Hip-Hop": {
    genre: "Hip-hop, boom bap / modern rap",
    vocals: "Confident rap delivery, clear diction, punchy rhythmic flow",
    arrangement: "Tight drums, sampled loop, bass, sparse melodic elements",
  },
  "Pop Ballad": {
    genre: "Pop ballad, emotional piano ballad",
    vocals: "Emotional vocal, soft verses building to a powerful chorus",
    arrangement: "Piano, strings, gentle drums entering at the chorus, warm bass",
  },
  "Thai Pop": {
    genre: "Thai pop, T-pop",
    vocals: "Clear, melodic vocal with natural Thai phrasing",
    arrangement: "Modern pop production, piano and guitar, punchy drums, synth pads",
  },
  "Isan / Luk Thung": {
    genre: "Isan-influenced pop, modern luk thung / mor lam fusion",
    vocals: "Expressive vocal with Isan character and ornamentation",
    arrangement: "Phin and khaen-inspired textures blended with modern drums and bass",
  },
  Pop: {
    genre: "Pop",
    vocals: "Clear lead vocal, catchy hook delivery",
    arrangement: "Modern pop production, drums, bass, synths and guitars",
  },
};

export function defaultSunoDraft(project: Project): SunoDraft {
  const hint = GENRE_HINTS[project.genre] ?? {
    genre: project.genre || "Pop",
    vocals: "Expressive lead vocal",
    arrangement: "Drums, bass, keys",
  };
  const lang =
    project.language === "mixed" ? "Thai and English" : project.language === "isan" ? "Isan / Thai" : LANGUAGE_LABELS[project.language];
  return {
    genre: hint.genre,
    mood: project.mood || "Heartfelt, melancholic",
    tempo: `${Math.round(project.bpm)} BPM, ${keyLabel(project.key, project.scale)}`,
    vocals: `${hint.vocals}; sung in ${lang}`,
    arrangement: hint.arrangement,
    extra: "",
  };
}

export function formatSunoPrompt(d: SunoDraft): string {
  return [
    d.genre && `Genre: ${d.genre}`,
    d.mood && `Mood: ${d.mood}`,
    d.tempo && `Tempo: ${d.tempo}`,
    d.vocals && `Vocals: ${d.vocals}`,
    d.arrangement && `Arrangement: ${d.arrangement}`,
    d.extra && d.extra,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact one-line style description (comma separated). */
export function formatSunoStyleLine(d: SunoDraft): string {
  return [d.genre, d.mood, d.tempo, d.vocals, d.arrangement, d.extra]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/** Plain-text lyric sheet with metadata (for FL Studio notes, sharing, printing). */
export function formatLyricSheet(project: Project): string {
  const flats = prefersFlats(project.key, project.scale);
  const bar = ticksPerBar(project.timeSignature);
  const chords = [...project.chords]
    .sort((a, b) => a.startTick - b.startTick)
    .map((c) => `${chordSymbol({ root: c.root, quality: c.quality, bass: c.bass }, flats)}${c.durationTicks !== bar ? ` (${(c.durationTicks / bar).toFixed(2).replace(/\.00$/, "")} bar)` : ""}`)
    .join(" – ");
  const header = [
    project.title,
    `Genre: ${project.genre}${project.mood ? ` · Mood: ${project.mood}` : ""}`,
    `Key: ${keyLabel(project.key, project.scale)} · Tempo: ${project.bpm} BPM · Time: ${project.timeSignature.numerator}/${project.timeSignature.denominator}`,
    chords ? `Chords: ${chords}` : "",
    `Language: ${LANGUAGE_LABELS[project.language]}`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = project.sections
    .map((s) => `[${s.label || SECTION_LABELS[s.type]}]\n${s.lines.map((l) => l.text).filter((t) => t.trim()).join("\n")}`)
    .join("\n\n");
  return `${header}\n\n${body}\n`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string): string {
  return (name.trim() || "song").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}
