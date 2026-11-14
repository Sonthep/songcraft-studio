import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { LocalProjectRepository, exportProject, parseProjectImport } from "./repository";
import { resetDbConnection } from "./db";
import { createProject } from "@/lib/project/factory";
import { projectToMidi, parseMidiFile } from "@/lib/midi/midi";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbConnection();
});

describe("local project persistence (IndexedDB)", () => {
  it("saves, lists, loads and updates projects", async () => {
    const repo = new LocalProjectRepository();
    const p = createProject({ title: "เพลงทดสอบ", bpm: 92 });
    p.sections[0].lines[0].text = "คิดถึงอุดร";
    const saved = await repo.save(p);
    expect(saved.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "เพลงทดสอบ", bpm: 92, lineCount: 1 });
    const loaded = await repo.get(p.id);
    expect(loaded?.sections[0].lines[0].text).toBe("คิดถึงอุดร");
    await repo.save({ ...loaded!, title: "Renamed" });
    expect((await repo.get(p.id))?.title).toBe("Renamed");
  });

  it("rejects invalid projects instead of storing them", async () => {
    const repo = new LocalProjectRepository();
    const p = createProject({ title: "x" });
    await expect(repo.save({ ...p, bpm: 9999 })).rejects.toThrow();
    expect(await repo.list()).toHaveLength(0);
  });

  it("duplicates without sharing recordings and deletes with audio", async () => {
    const repo = new LocalProjectRepository();
    const p = createProject({ title: "Song" });
    p.audioAssets.push({ id: "a1", kind: "take", name: "Take 1", mimeType: "audio/webm", durationSec: 1, sizeBytes: 3, createdAt: 1, offsetSec: 0, notes: "" });
    await repo.save(p);
    await repo.putAudio(p.id, "a1", new Blob([new Uint8Array([1, 2, 3])]));
    expect(await repo.getAudio("a1")).not.toBeNull();
    const copy = await repo.duplicate(p.id);
    expect(copy.id).not.toBe(p.id);
    expect(copy.title).toBe("Song (copy)");
    expect(copy.audioAssets).toHaveLength(0);
    await repo.remove(p.id);
    expect(await repo.get(p.id)).toBeNull();
    expect(await repo.getAudio("a1")).toBeNull();
    expect(await repo.list()).toHaveLength(1);
  });

  it("round-trips JSON export/import with a new id and validates input", () => {
    const p = createProject({ title: "Export me" });
    const json = JSON.parse(JSON.stringify(exportProject(p)));
    const imported = parseProjectImport(json);
    expect(imported.id).not.toBe(p.id);
    expect(imported.title).toBe("Export me");
    expect(() => parseProjectImport({ format: "nope" })).toThrow(/Not a valid SongCraft project/);
    expect(() => parseProjectImport({ ...json, project: { ...json.project, notes: [{ id: "n", pitch: 300 }] } })).toThrow();
  });
});

describe("MIDI export", () => {
  it("writes notes, chords, tempo, time and key signature that parse back", () => {
    const p = createProject({ title: "Midi", bpm: 75, key: 9, scale: "minor" });
    p.notes = [
      { id: "n1", pitch: 69, startTick: 0, durationTicks: 480, velocity: 100, syllableId: "l#0" },
      { id: "n2", pitch: 72, startTick: 600, durationTicks: 120, velocity: 64, syllableId: null },
    ];
    const bytes = projectToMidi(p, { includeMelody: true, includeChords: true, includeLyrics: true, syllableText: () => "รัก" });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    const parsed = parseMidiFile(bytes);
    expect(parsed.bpm).toBeCloseTo(75, 0);
    expect(parsed.timeSignature).toEqual([4, 4]);
    const melody = parsed.tracks.find((t) => t.name === "Melody")!;
    expect(melody.notes.map((n) => [n.pitch, n.startTick, n.durationTicks])).toEqual([
      [69, 0, 480],
      [72, 600, 120],
    ]);
    expect(melody.notes[1].velocity).toBeGreaterThanOrEqual(63);
    expect(parsed.tracks.find((t) => t.name === "Chords")!.noteCount).toBe(12); // 4 triads
  });
});
