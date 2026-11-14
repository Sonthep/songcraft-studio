import { describe, expect, it } from "vitest";
import type { MidiNote } from "@/lib/project/schema";
import { addNote, copyNotes, deleteNotes, duplicateNotes, moveNotes, notesInRect, pasteNotes, quantizeNotes, resizeNotes, setVelocity, trimOverlaps, updateNote } from "./note-ops";

const n = (id: string, pitch: number, startTick: number, durationTicks = 120, velocity = 100): MidiNote => ({ id, pitch, startTick, durationTicks, velocity, syllableId: null });

describe("note editing", () => {
  it("adds notes with clamped values", () => {
    const { notes, note } = addNote([], { pitch: 200, startTick: -5, durationTicks: 0, velocity: 300, syllableId: "l#0" });
    expect(notes).toHaveLength(1);
    expect(note).toMatchObject({ pitch: 127, startTick: 0, durationTicks: 1, velocity: 127, syllableId: "l#0" });
  });

  it("moves a selection as a group and clamps at edges", () => {
    const notes = [n("a", 60, 100), n("b", 64, 400), n("c", 70, 0)];
    const moved = moveNotes(notes, new Set(["a", "b"]), -300, 2);
    expect(moved.find((x) => x.id === "a")).toMatchObject({ startTick: 0, pitch: 62 });
    expect(moved.find((x) => x.id === "b")).toMatchObject({ startTick: 300, pitch: 66 });
    expect(moved.find((x) => x.id === "c")).toMatchObject({ startTick: 0, pitch: 70 });
    const top = moveNotes([n("x", 126, 0), n("y", 120, 0)], new Set(["x", "y"]), 0, 10);
    expect(top.map((x) => x.pitch)).toEqual([127, 121]);
  });

  it("resizes with a minimum and sets velocity", () => {
    const notes = [n("a", 60, 0, 240)];
    expect(resizeNotes(notes, new Set(["a"]), -500, 60)[0].durationTicks).toBe(60);
    expect(resizeNotes(notes, new Set(["a"]), 120, 60)[0].durationTicks).toBe(360);
    expect(setVelocity(notes, new Set(["a"]), 0)[0].velocity).toBe(1);
    expect(updateNote(notes, "a", { pitch: -3 })[0].pitch).toBe(0);
  });

  it("copies, pastes and duplicates with new ids", () => {
    const notes = [n("a", 60, 480), n("b", 62, 720)];
    const clip = copyNotes(notes, new Set(["a", "b"]))!;
    expect(clip.notes.map((x) => x.startTick)).toEqual([0, 240]);
    expect(clip.span).toBe(360);
    const pasted = pasteNotes(notes, clip, 1920);
    expect(pasted.notes).toHaveLength(4);
    expect(pasted.pastedIds).toHaveLength(2);
    expect(pasted.notes.filter((x) => pasted.pastedIds.includes(x.id)).map((x) => x.startTick)).toEqual([1920, 2160]);
    const dup = duplicateNotes(notes, new Set(["a", "b"]));
    expect(dup.notes.filter((x) => dup.pastedIds.includes(x.id)).map((x) => x.startTick)).toEqual([840, 1080]);
    expect(deleteNotes(notes, new Set(["a"])).map((x) => x.id)).toEqual(["b"]);
  });

  it("selects by rectangle", () => {
    const notes = [n("a", 60, 0, 240), n("b", 72, 0), n("c", 60, 1000)];
    expect(notesInRect(notes, { tickStart: 100, tickEnd: 500, pitchLow: 59, pitchHigh: 61 })).toEqual(["a"]);
  });

  it("trims overlaps for monophonic lines", () => {
    const out = trimOverlaps([n("a", 60, 0, 600), n("b", 62, 480, 240)]);
    expect(out[0].durationTicks).toBe(480);
  });
});

describe("quantization", () => {
  it("quantizes starts fully and partially", () => {
    const notes = [n("a", 60, 130, 100), n("b", 60, 470, 50)];
    const full = quantizeNotes(notes, null, { grid: 120, strength: 1, quantizeEnds: false });
    expect(full.map((x) => x.startTick)).toEqual([120, 480]);
    const half = quantizeNotes(notes, null, { grid: 120, strength: 0.5, quantizeEnds: false });
    expect(half.map((x) => x.startTick)).toEqual([125, 475]);
  });

  it("quantizes ends to at least one grid unit", () => {
    const out = quantizeNotes([n("a", 60, 10, 20)], null, { grid: 120, strength: 1, quantizeEnds: true });
    expect(out[0]).toMatchObject({ startTick: 0, durationTicks: 120 });
  });

  it("only affects the selection when given", () => {
    const notes = [n("a", 60, 130), n("b", 60, 130)];
    const out = quantizeNotes(notes, new Set(["a"]), { grid: 120, strength: 1, quantizeEnds: false });
    expect(out.map((x) => x.startTick)).toEqual([120, 130]);
  });
});
