import { describe, expect, it } from "vitest";
import { generateCandidates, layoutPhrases, regeneratePhrase, DEFAULT_CONTROLS, type MelodyInput } from "./generator";
import { segmentLine } from "@/lib/lyrics/syllables";
import { chordsFromSpecs } from "@/lib/project/factory";
import { mod12, scalePitchClasses } from "@/lib/music/theory";

const lines = [
  { id: "l1", text: "ฉันยังคิดถึงเธอทุกคืน" },
  { id: "l2", text: "หัวใจยังสั่นคลอน" },
  { id: "l3", text: "ฉันยังคิดถึงเธอทุกคืน" },
];

function input(seed = 42, style: MelodyInput["style"] = "rnb"): MelodyInput {
  return {
    phrases: lines.map((l) => ({ lineId: l.id, text: l.text, sectionType: "chorus", tokens: segmentLine({ ...l, syllableOverride: null }) })),
    key: 9,
    scale: "minor",
    timeSignature: { numerator: 4, denominator: 4 },
    chords: chordsFromSpecs(
      [
        { root: 9, quality: "min" },
        { root: 5, quality: "maj" },
        { root: 0, quality: "maj" },
        { root: 7, quality: "maj" },
      ],
      1920,
    ),
    vocalRange: { low: 55, high: 74 },
    startTick: 0,
    style,
    controls: { ...DEFAULT_CONTROLS, repetition: 0.8 },
    seed,
  };
}

describe("rule-based melody generator", () => {
  it("produces three distinct candidates", () => {
    const c = generateCandidates(input(), 3);
    expect(c).toHaveLength(3);
    const sig = c.map((x) => x.notes.map((n) => `${n.pitch}@${n.startTick}`).join(","));
    expect(new Set(sig).size).toBe(3);
  });

  it("links exactly one note to every syllable, in order, with required fields", () => {
    const inp = input();
    const [c] = generateCandidates(inp, 1);
    const tokenIds = inp.phrases.flatMap((p) => p.tokens.map((t) => t.id));
    expect(c.notes.map((n) => n.syllableId)).toEqual(tokenIds);
    for (const n of c.notes) {
      expect(Number.isInteger(n.pitch)).toBe(true);
      expect(n.durationTicks).toBeGreaterThan(0);
      expect(n.velocity).toBeGreaterThanOrEqual(1);
      expect(n.velocity).toBeLessThanOrEqual(127);
    }
  });

  it("stays inside the vocal range and in scale; onsets increase within phrases", () => {
    for (const style of ["rnb", "melodicRap", "sadBallad", "thaiPop", "isan"] as const) {
      const [c] = generateCandidates(input(7, style), 1);
      const pcs = scalePitchClasses(9, "minor");
      for (const n of c.notes) {
        expect(n.pitch).toBeGreaterThanOrEqual(55);
        expect(n.pitch).toBeLessThanOrEqual(74);
        expect(pcs).toContain(mod12(n.pitch));
      }
      for (const lay of c.layout) {
        const ph = c.notes.filter((n) => n.lineId === lay.lineId);
        for (let i = 1; i < ph.length; i++) expect(ph[i].startTick).toBeGreaterThan(ph[i - 1].startTick);
        expect(ph[0].startTick).toBeGreaterThanOrEqual(lay.startTick);
        const last = ph[ph.length - 1];
        expect(last.startTick + last.durationTicks).toBeLessThanOrEqual(lay.startTick + lay.bars * 1920);
      }
    }
  });

  it("is deterministic for a seed", () => {
    const a = generateCandidates(input(99), 1)[0].notes.map((n) => [n.pitch, n.startTick]);
    const b = generateCandidates(input(99), 1)[0].notes.map((n) => [n.pitch, n.startTick]);
    expect(a).toEqual(b);
  });

  it("reuses repeated lyric lines when repetition is high", () => {
    const [c] = generateCandidates(input(5), 1);
    const p1 = c.notes.filter((n) => n.lineId === "l1");
    const p3 = c.notes.filter((n) => n.lineId === "l3");
    expect(p3.map((n) => n.pitch)).toEqual(p1.map((n) => n.pitch));
  });

  it("regenerates one phrase without touching the others", () => {
    const inp = input(3);
    const [c] = generateCandidates(inp, 1);
    const next = regeneratePhrase(inp, c, "l2", 123456);
    const keep = (x: typeof c) => x.notes.filter((n) => n.lineId !== "l2").map((n) => [n.pitch, n.startTick]);
    expect(keep(next)).toEqual(keep(c));
    expect(next.notes.filter((n) => n.lineId === "l2")).toHaveLength(inp.phrases[1].tokens.length);
  });

  it("gives long lines extra bars", () => {
    const inp = input();
    inp.controls = { ...inp.controls, phraseBars: 1 };
    inp.phrases[0].tokens = [...inp.phrases[0].tokens, ...inp.phrases[0].tokens, ...inp.phrases[0].tokens];
    expect(layoutPhrases(inp)[0].bars).toBeGreaterThan(1);
  });
});
