import { describe, expect, it } from "vitest";
import { segmentThaiWord, thaiRhymeLabel, computeTone } from "./thai";
import { findThaiRhymes } from "./rhyme-finder";
import { compareRhymeUnits, thaiRhymeUnit } from "./rhyme";

const split = (w: string) => segmentThaiWord(w).map((s) => s.text);
const last = (w: string) => {
  const s = segmentThaiWord(w);
  return s[s.length - 1];
};

describe("Thai syllable segmentation", () => {
  it.each([
    ["อุดร", ["อุ", "ดร"]],
    ["ออนซอน", ["ออน", "ซอน"]],
    ["สะออน", ["สะ", "ออน"]],
    ["สั่นคลอน", ["สั่น", "คลอน"]],
    ["กาพย์กลอน", ["กาพย์", "กลอน"]],
    ["อ้อนวอน", ["อ้อน", "วอน"]],
    ["อาวรณ์", ["อา", "วรณ์"]],
    ["สบาย", ["ส", "บาย"]],
    ["ขนม", ["ข", "นม"]],
    ["เพลง", ["เพลง"]],
    ["เกลียด", ["เกลียด"]],
    ["เหงา", ["เหงา"]],
    ["หัวใจ", ["หัว", "ใจ"]],
    ["จันทร์", ["จันทร์"]],
    ["สวรรค์", ["ส", "วรรค์"]],
    ["น้ำตา", ["น้ำ", "ตา"]],
  ])("%s → %j", (word, expected) => {
    expect(split(word)).toEqual(expected);
  });

  it("derives vowel + final sound (not spelling) for rhyme", () => {
    for (const w of ["อุดร", "ออนซอน", "สะออน", "สั่นคลอน", "กาพย์กลอน", "อ้อนวอน", "อาวรณ์"]) {
      expect(thaiRhymeLabel(last(w))).toBe("ɔɔ + n");
    }
    expect(last("เกลียด").coda).toBe("t");
    expect(last("รัก").coda).toBe("k");
    expect(thaiRhymeLabel(last("ใจ"))).toBe("a + j");
  });

  it("computes tones from class, live/dead and tone marks", () => {
    expect(last("ขนม").tone).toBe("rising"); // leading consonant: ขะ-หนม
    expect(last("รัก").tone).toBe("high");
    expect(last("อ้อนวอน").tone).toBe("mid");
    expect(segmentThaiWord("อ้อน")[0].tone).toBe("falling");
    expect(last("ใหม่").tone).toBe("low");
    expect(computeTone("low", false, true, null)).toBe("falling");
    expect(computeTone("mid", true, true, "๋")).toBe("rising");
  });

  it("flags hidden-vowel readings with lower confidence", () => {
    expect(segmentThaiWord("สบาย")[0].confidence).toBeLessThan(0.7);
    expect(segmentThaiWord("คน")[0].confidence).toBeLessThan(0.9);
    expect(segmentThaiWord("บาย")[0].confidence).toBeGreaterThan(0.9);
  });
});

describe("Thai rhyme comparison & finder", () => {
  it("treats different spellings of /n/ as exact rhymes", () => {
    const c = compareRhymeUnits(thaiRhymeUnit(last("อาวรณ์")), thaiRhymeUnit(last("กลอน")));
    expect(c.kind).toBe("exact");
    expect(c.reasons.join(" ")).toMatch(/same final sound/);
  });

  it("distinguishes vowel length as a near rhyme", () => {
    const c = compareRhymeUnits(thaiRhymeUnit(last("กัน")), thaiRhymeUnit(last("งาน")));
    expect(c.kind).toBe("near");
  });

  it("finds the example rhymes for อุดร", () => {
    const { results } = findThaiRhymes("อุดร", { custom: [] });
    const exact = results.filter((r) => r.comparison.kind === "exact").map((r) => r.word);
    for (const w of ["ออนซอน", "สะออน", "สั่นคลอน", "กาพย์กลอน", "อ้อนวอน", "อาวรณ์"]) expect(exact).toContain(w);
    expect(results.find((r) => r.word === "ออนซอน")?.source).toBe("isan");
  });

  it("detects multisyllabic matches", () => {
    const { results } = findThaiRhymes("ออนซอน", { custom: [] });
    expect(results.find((r) => r.word === "อ้อนวอน")?.multi).toBe(2);
  });

  it("honours custom rhyme groups", () => {
    const now = Date.now();
    const { results } = findThaiRhymes("ม่วน", {
      custom: [
        { id: "1", word: "ม่วน", language: "isan", group: "party", vowel: "", long: false, coda: "auto", syllables: "", meaning: "", createdAt: now },
        { id: "2", word: "แซ่บ", language: "isan", group: "party", vowel: "", long: false, coda: "auto", syllables: "", meaning: "", createdAt: now },
      ],
    });
    expect(results.find((r) => r.word === "แซ่บ")?.comparison.kind).toBe("custom");
  });
});
