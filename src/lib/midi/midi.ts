import { Midi } from "@tonejs/midi";
import { PPQ } from "@/lib/music/timing";
import { mod12, voiceChord, type ScaleName } from "@/lib/music/theory";
import type { ChordEvent, MidiNote, Project } from "@/lib/project/schema";
import { uid } from "@/lib/project/factory";

/** Key names in circle-of-fifths order used by Standard MIDI key-signature events. */
const MAJOR_KEY_BY_PC: Record<number, string> = {
  0: "C", 7: "G", 2: "D", 9: "A", 4: "E", 11: "B", 6: "F#", 1: "Db", 8: "Ab", 3: "Eb", 10: "Bb", 5: "F",
};

function isMinorScale(scale: ScaleName) {
  return scale === "minor" || scale === "harmonicMinor" || scale === "dorian" || scale === "pentatonicMinor";
}

export interface MidiExportOptions {
  includeMelody: boolean;
  includeChords: boolean;
  includeLyrics: boolean;
  /** Lookup used to attach syllable text to melody notes as lyric meta events. */
  syllableText?: (syllableId: string) => string | undefined;
}

export function chordNotes(chords: ChordEvent[]): Array<{ midi: number; ticks: number; durationTicks: number; velocity: number }> {
  const out: Array<{ midi: number; ticks: number; durationTicks: number; velocity: number }> = [];
  for (const c of chords) {
    for (const p of voiceChord({ root: c.root, quality: c.quality, bass: c.bass }, c.octave, c.inversion, c.spread)) {
      out.push({ midi: p, ticks: c.startTick, durationTicks: c.durationTicks, velocity: 0.55 });
    }
  }
  return out;
}

/** Build a Standard MIDI File (type 1) from a project. Returns raw bytes. */
export function projectToMidi(project: Project, opts: MidiExportOptions): Uint8Array {
  const midi = new Midi();
  midi.header.name = project.title;
  midi.header.setTempo(project.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [project.timeSignature.numerator, project.timeSignature.denominator],
  });
  const minor = isMinorScale(project.scale);
  const majorPc = minor ? mod12(project.key + 3) : project.key;
  midi.header.keySignatures.push({ ticks: 0, key: MAJOR_KEY_BY_PC[majorPc], scale: minor ? "minor" : "major" });
  midi.header.update();

  if (opts.includeMelody) {
    const track = midi.addTrack();
    track.name = "Melody";
    track.channel = 0;
    track.instrument.number = 0; // Acoustic Grand Piano (GM)
    const sorted = [...project.notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
    for (const n of sorted) {
      track.addNote({ midi: n.pitch, ticks: n.startTick, durationTicks: n.durationTicks, velocity: n.velocity / 127 });
    }
    if (opts.includeLyrics && opts.syllableText) {
      for (const n of sorted) {
        if (!n.syllableId) continue;
        const text = opts.syllableText(n.syllableId);
        if (text) midi.header.meta.push({ ticks: n.startTick, type: "lyrics", text });
      }
    }
  }
  if (opts.includeChords && project.chords.length) {
    const track = midi.addTrack();
    track.name = "Chords";
    track.channel = 1;
    track.instrument.number = 4; // Electric Piano 1 (GM)
    for (const n of chordNotes(project.chords)) track.addNote(n);
  }
  return midi.toArray();
}

export interface ImportedMidi {
  name: string;
  bpm: number | null;
  timeSignature: [number, number] | null;
  tracks: Array<{ name: string; channel: number; noteCount: number; notes: MidiNote[] }>;
}

/** Parse a MIDI file and rescale its notes to the app's PPQ. */
export function parseMidiFile(bytes: ArrayBuffer | Uint8Array): ImportedMidi {
  const midi = new Midi(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const scale = PPQ / midi.header.ppq;
  const ts = midi.header.timeSignatures[0]?.timeSignature;
  return {
    name: midi.header.name || midi.name || "Imported MIDI",
    bpm: midi.header.tempos[0]?.bpm ?? null,
    timeSignature: ts && ts.length >= 2 ? [ts[0], ts[1]] : null,
    tracks: midi.tracks
      .map((t, i) => ({
        name: t.name || `Track ${i + 1}`,
        channel: t.channel,
        noteCount: t.notes.length,
        notes: t.notes.map((n) => ({
          id: uid("n"),
          pitch: n.midi,
          startTick: Math.max(0, Math.round(n.ticks * scale)),
          durationTicks: Math.max(1, Math.round(n.durationTicks * scale)),
          velocity: Math.max(1, Math.min(127, Math.round(n.velocity * 127))),
          syllableId: null,
        })),
      }))
      .filter((t) => t.noteCount > 0),
  };
}
