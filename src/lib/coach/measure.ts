import type { Project } from "@/lib/project/schema";
import { SECTION_LABELS } from "@/lib/project/schema";
import type { LyricsAnalysis } from "@/lib/lyrics/analysis";
import { chordPitchClasses, chordSymbol, keyLabel, midiToName, mod12, prefersFlats } from "@/lib/music/theory";
import { metricStrength, ticksPerBar } from "@/lib/music/timing";

export interface Finding {
  id: string;
  severity: "info" | "suggestion" | "warning";
  topic: string;
  title: string;
  detail: string;
  evidence: string;
}

export interface Measurements {
  lines: string[];
  findings: Finding[];
}

/**
 * Deterministic measurements of the song. These are facts the app can compute
 * (counts, ranges, ratios) plus rule-of-thumb findings with the evidence used.
 */
export function measureSong(p: Project, a: LyricsAnalysis | null): Measurements {
  const lines: string[] = [];
  const findings: Finding[] = [];
  const flats = prefersFlats(p.key, p.scale);
  const bar = ticksPerBar(p.timeSignature);

  lines.push(`Key ${keyLabel(p.key, p.scale)}, ${p.bpm} BPM, ${p.timeSignature.numerator}/${p.timeSignature.denominator}, genre ${p.genre}, language ${p.language}.`);
  const structure = p.sections.map((s) => s.label || SECTION_LABELS[s.type]).join(" → ");
  lines.push(`Structure: ${structure || "(empty)"}.`);

  const nonEmpty = p.sections.filter((s) => s.lines.some((l) => l.text.trim()));
  const types = new Set(nonEmpty.map((s) => s.type));
  if (nonEmpty.length && !types.has("chorus") && !types.has("hook")) {
    findings.push({
      id: "no-hook",
      severity: "suggestion",
      topic: "songStructure",
      title: "No chorus or hook section yet",
      detail: "Most songs in these genres return to a repeated chorus/hook that carries the title idea. Without one, listeners have no anchor.",
      evidence: `Sections with lyrics: ${nonEmpty.map((s) => s.label).join(", ")}`,
    });
  }

  if (a) {
    for (const s of a.sections) {
      const sec = p.sections.find((x) => x.id === s.sectionId);
      if (!sec) continue;
      const counted = s.lines.filter((l) => l.syllableCount > 0);
      if (!counted.length) continue;
      lines.push(`${sec.label}: ${counted.length} lines, avg ${s.averageSyllables.toFixed(1)} syllables (spread ${s.syllableSpread}), rhyme scheme ${s.scheme}.`);
      if (s.syllableSpread >= 5 && sec.type !== "rapVerse") {
        const max = counted.reduce((m, l) => (l.syllableCount > m.syllableCount ? l : m));
        const min = counted.reduce((m, l) => (l.syllableCount < m.syllableCount ? l : m));
        findings.push({
          id: `spread-${sec.id}`,
          severity: "suggestion",
          topic: "vocalPhrasing",
          title: `Uneven line lengths in ${sec.label}`,
          detail: "Parallel lines that differ a lot in syllable count are hard to sing to the same melody. Either even them out or make the difference intentional.",
          evidence: `“${max.text.trim()}” has ${max.syllableCount} syllables; “${min.text.trim()}” has ${min.syllableCount}.`,
        });
      }
      const letters = s.lines.map((l) => l.letter).filter(Boolean);
      if (letters.length >= 4 && new Set(letters).size === letters.length) {
        findings.push({
          id: `norhyme-${sec.id}`,
          severity: "info",
          topic: "rhymeSchemes",
          title: `No end rhymes detected in ${sec.label}`,
          detail: "Every line ends on a different sound. That can work for spoken styles, but choruses and hooks usually benefit from at least one rhyme pair.",
          evidence: `Scheme ${s.scheme} (detected automatically; verify by ear).`,
        });
      }
      if ((sec.type === "chorus" || sec.type === "hook") && counted.length >= 2) {
        const texts = counted.map((l) => l.text.trim().toLowerCase());
        const repeated = texts.length - new Set(texts).size;
        if (repeated === 0) {
          findings.push({
            id: `hookrep-${sec.id}`,
            severity: "suggestion",
            topic: "hookWriting",
            title: `${sec.label} has no repeated line`,
            detail: "Hooks become memorable through repetition — repeating the title line (or a short phrase) 2–4 times is the most reliable technique.",
            evidence: `${counted.length} lines, all different.`,
          });
        }
      }
    }
    const content = a.repetitions.filter((r) => r.content).slice(0, 6);
    if (content.length) lines.push(`Most repeated words: ${content.map((r) => `${r.word}×${r.count}`).join(", ")}.`);
  }

  if (p.chords.length) {
    const prog = [...p.chords].sort((x, y) => x.startTick - y.startTick).map((c) => chordSymbol(c, flats)).join(" – ");
    lines.push(`Chord progression: ${prog}.`);
  } else {
    lines.push("No chord progression yet.");
  }

  if (p.notes.length) {
    const notes = [...p.notes].sort((x, y) => x.startTick - y.startTick);
    const pitches = notes.map((n) => n.pitch);
    const lo = Math.min(...pitches);
    const hi = Math.max(...pitches);
    let steps = 0;
    let leaps = 0;
    let bigLeaps = 0;
    for (let i = 1; i < notes.length; i++) {
      const d = Math.abs(notes[i].pitch - notes[i - 1].pitch);
      if (d <= 2) steps++;
      else leaps++;
      if (d > 7) bigLeaps++;
    }
    const linked = notes.filter((n) => n.syllableId).length;
    lines.push(`Melody: ${notes.length} notes, range ${midiToName(lo, flats)}–${midiToName(hi, flats)} (${hi - lo} semitones), ${Math.round((steps / Math.max(1, steps + leaps)) * 100)}% stepwise, ${bigLeaps} leaps larger than a 5th, ${linked} notes linked to syllables.`);
    const outside = notes.filter((n) => n.pitch < p.vocalRange.low || n.pitch > p.vocalRange.high).length;
    if (outside) {
      findings.push({
        id: "range",
        severity: "warning",
        topic: "melodicContour",
        title: "Melody goes outside your vocal range",
        detail: "Notes outside your comfortable range will sound strained. Fold them by an octave or rewrite the phrase.",
        evidence: `${outside} of ${notes.length} notes are outside ${midiToName(p.vocalRange.low, flats)}–${midiToName(p.vocalRange.high, flats)}.`,
      });
    }
    if (bigLeaps >= 3) {
      findings.push({
        id: "leaps",
        severity: "info",
        topic: "melodicContour",
        title: "Several large leaps",
        detail: "Leaps bigger than a fifth are expressive, but many of them make a line hard to sing. Follow a big leap with stepwise motion in the opposite direction.",
        evidence: `${bigLeaps} leaps larger than 7 semitones.`,
      });
    }
    if (p.chords.length) {
      const sorted = [...p.chords].sort((x, y) => x.startTick - y.startTick);
      const at = (t: number) => sorted.filter((c) => c.startTick <= t).pop();
      const strong = notes.filter((n) => metricStrength(n.startTick, p.timeSignature) >= 2);
      const fit = strong.filter((n) => {
        const c = at(n.startTick);
        return c && chordPitchClasses(c).includes(mod12(n.pitch));
      }).length;
      if (strong.length >= 4) {
        lines.push(`Chord tones on strong beats: ${Math.round((fit / strong.length) * 100)}% of ${strong.length} notes.`);
        if (fit / strong.length < 0.4) {
          findings.push({
            id: "chordfit",
            severity: "info",
            topic: "topline",
            title: "Few chord tones on strong beats",
            detail: "Landing on chord tones (root, 3rd, 5th) on beats 1 and 3 makes a melody feel anchored; non-chord tones there create tension that should resolve.",
            evidence: `${fit} of ${strong.length} strong-beat notes are chord tones.`,
          });
        }
      }
    }
    if (linked === 0 && a && a.totalSyllables > 0) {
      findings.push({
        id: "unlinked",
        severity: "info",
        topic: "topline",
        title: "Melody notes are not linked to lyrics",
        detail: "Linking notes to syllables (via the Melody Designer or the inspector) lets you check that stressed syllables land on strong beats.",
        evidence: `${notes.length} notes, none linked; ${a.totalSyllables} syllables in the lyrics.`,
      });
    }
  } else {
    lines.push("No melody notes yet.");
  }

  const totalBars = p.chords.length ? Math.ceil(Math.max(...p.chords.map((c) => c.startTick + c.durationTicks)) / bar) : 0;
  if (totalBars) lines.push(`Chord loop length: ${totalBars} bars.`);
  return { lines, findings };
}
