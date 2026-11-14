import { describe, expect, it } from "vitest";
import { segmentLine, parseOverrideText, tokensToOverrideText } from "./syllables";
import { analyzeSection } from "./analysis";
import { compareRhymeUnits } from "./rhyme";

const line = (text: string, syllableOverride: string[] | null = null) => ({ id: "L1", text, syllableOverride });

describe("syllable segmentation of lyric lines", () => {
  it("segments Thai without spaces and assigns stable ids", () => {
    const t = segmentLine(line("ฉันยังคิดถึงเธอทุกคืน"));
    expect(t.map((x) => x.text)).toEqual(["ฉัน", "ยัง", "คิด", "ถึง", "เธอ", "ทุก", "คืน"]);
    expect(t.map((x) => x.id)).toEqual(t.map((_, i) => `L1#${i}`));
  });

  it("handles mixed Thai/English and uses CMU phones when provided", () => {
    const pron = { heart: ["HH", "AA1", "R", "T"], apart: ["AH0", "P", "AA1", "R", "T"] };
    const t = segmentLine(line("ใจ my heart"), pron);
    expect(t.map((x) => x.lang)).toEqual(["th", "en", "en"]);
    const t2 = segmentLine({ id: "L2", text: "falling apart", syllableOverride: null }, pron);
    const a = t[t.length - 1].wordRhyme!;
    const b = t2[t2.length - 1].wordRhyme!;
    expect(compareRhymeUnits(a, b).kind).toBe("exact");
  });

  it("expands the repetition mark ๆ", () => {
    const t = segmentLine(line("ช้าๆ"));
    expect(t.map((x) => x.text)).toEqual(["ช้า", "ช้า"]);
  });

  it("honours manual syllable overrides", () => {
    const t = segmentLine(line("ผลไม้", ["ผล", "ละ", "ไม้"]));
    expect(t.map((x) => x.text)).toEqual(["ผล", "ละ", "ไม้"]);
    expect(t.every((x) => x.manual)).toBe(true);
    expect(parseOverrideText("อุ-ดร ออน-ซอน")).toEqual(["อุ", "ดร", "ออน", "ซอน"]);
    expect(tokensToOverrideText(segmentLine(line("รักเธอ")))).toBe("รัก เธอ");
  });

  it("builds a rhyme scheme from line endings", () => {
    const sec = {
      id: "S",
      type: "verse" as const,
      label: "Verse",
      lines: [
        { id: "a", text: "คืนนี้ฉันนอนไม่หลับ", syllableOverride: null },
        { id: "b", text: "คิดถึงอุดร", syllableOverride: null },
        { id: "c", text: "ใจยังรอคอยกลับ", syllableOverride: null },
        { id: "d", text: "เพลงกาพย์กลอน", syllableOverride: null },
      ],
    };
    const a = analyzeSection(sec);
    expect(a.scheme).toBe("ABAB");
    expect(a.lines[1].endGroup).not.toBeNull();
  });
});
