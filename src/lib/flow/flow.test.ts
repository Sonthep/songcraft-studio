import { describe, expect, it } from "vitest";
import { autoArrange, flowStats, flowToNotes, moveSyllable, shiftLine } from "./flow";
import { segmentLine } from "@/lib/lyrics/syllables";

const ts = { numerator: 4, denominator: 4 };
const mk = (id: string, text: string) => {
  const tokens = segmentLine({ id, text, syllableOverride: null });
  return { lineId: id, tokens, endRhymeTokenId: tokens[tokens.length - 1].id };
};

describe("rap flow", () => {
  const lines = [mk("a", "ฉันยังคิดถึงเธอทุกคืน"), mk("b", "หัวใจยังสั่นคลอน")];

  it.each(["straight", "onbeat", "syncopated", "laidBack", "triplet", "doubleTime"] as const)("%s keeps order and stays inside each line", (pattern) => {
    const spb = pattern === "triplet" ? 3 : pattern === "doubleTime" ? 8 : 4;
    const { placements } = autoArrange(lines, pattern, spb, 1, ts);
    const perLine = spb * 4;
    lines.forEach((l, li) => {
      const slots = l.tokens.map((t) => placements[t.id]);
      for (let i = 1; i < slots.length; i++) expect(slots[i]).toBeGreaterThan(slots[i - 1]);
      for (const s of slots) {
        expect(s).toBeGreaterThanOrEqual(li * perLine);
        expect(s).toBeLessThan((li + 1) * perLine);
      }
    });
  });

  it("lands the end rhyme on the last beat when there is room", () => {
    const { placements } = autoArrange([mk("c", "รักเธอ")], "straight", 4, 1, ts, true);
    expect(placements["c#1"]).toBe(12);
  });

  it("swaps when moving onto an occupied slot and shifts lines", () => {
    const pl = { x: 0, y: 4 };
    expect(moveSyllable(pl, "x", 4)).toEqual({ x: 4, y: 0 });
    expect(moveSyllable(pl, "x", 2)).toEqual({ x: 2, y: 4 });
    expect(shiftLine(pl, ["x", "y"], -3)).toEqual({ x: 0, y: 4 });
  });

  it("computes stats and converts to notes linked to syllables", () => {
    const { placements } = autoArrange(lines, "straight", 4, 1, ts);
    const stats = flowStats(placements, 4, ts);
    expect(stats).toHaveLength(2);
    expect(stats[0].syllables).toBe(lines[0].tokens.length);
    const notes = flowToNotes(placements, lines.flatMap((l) => l.tokens), 4, ts, 1920, 57);
    expect(notes).toHaveLength(lines[0].tokens.length + lines[1].tokens.length);
    expect(notes[0].startTick).toBe(1920 + placements["a#0"] * 120);
    expect(notes.every((n) => n.syllableId)).toBe(true);
  });
});
