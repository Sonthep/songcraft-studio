import { describe, expect, it } from "vitest";
import { englishOnsetFromPhones, englishOnsetFromSpelling, thaiOnsetSound } from "./onset";
import { segmentLine } from "./syllables";
import { analyzeSection } from "./analysis";
import { findThaiAlliterations } from "./rhyme-finder";

describe("initial sounds (สัมผัสอักษร)", () => {
  it("maps Thai letters to sounds, not spellings", () => {
    expect(thaiOnsetSound("ข")!.key).toBe(thaiOnsetSound("ค")!.key);
    expect(thaiOnsetSound("ศ")!.key).toBe(thaiOnsetSound("ส")!.key);
    expect(thaiOnsetSound("ท")!.key).toBe(thaiOnsetSound("ธ")!.key);
    expect(thaiOnsetSound("ก")!.key).not.toBe(thaiOnsetSound("ค")!.key);
    expect(thaiOnsetSound("ต")!.key).not.toBe(thaiOnsetSound("ท")!.key);
  });

  it("follows the consonant after a silent ห or อ", () => {
    expect(thaiOnsetSound("หน")!.label).toBe("/n/");
    expect(thaiOnsetSound("หว")!.label).toBe("/w/");
    expect(thaiOnsetSound("อย")!.label).toBe("/j/");
  });

  it("marks clusters as approximate", () => {
    expect(thaiOnsetSound("กร")).toMatchObject({ label: "/k/", approximate: true });
  });

  it("reads English onsets from CMU phones, with a flagged spelling fallback", () => {
    expect(englishOnsetFromPhones(["K", "IH1", "NG"])!.label).toBe("/k/");
    expect(englishOnsetFromPhones(["AY1"])).toBeNull();
    expect(englishOnsetFromSpelling("city")).toMatchObject({ label: "/s/", approximate: true });
    expect(englishOnsetFromSpelling("phone")!.label).toBe("/f/");
  });
});

describe("alliteration in lyric lines", () => {
  it("groups syllables in a line that share an initial sound", () => {
    const sec = analyzeSection({ id: "S", type: "verse", label: "Verse", lines: [{ id: "L1", text: "ร้อนรนรักเธอ", syllableOverride: null }] });
    const groups = sec.lines[0].alliterations;
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("/r/");
    expect(groups[0].texts).toEqual(["ร้อน", "รน", "รัก"]);
    for (const id of groups[0].tokenIds) expect(sec.alliteration[id]).toBe(groups[0].group);
  });

  it("matches different letters with the same sound (ขอ / คืน)", () => {
    const sec = analyzeSection({ id: "S", type: "verse", label: "Verse", lines: [{ id: "L1", text: "ขอคืนความฝัน", syllableOverride: null }] });
    const g = sec.lines[0].alliterations.find((a) => a.label === "/kʰ/");
    expect(g?.texts).toEqual(["ขอ", "คืน", "ความ"]);
  });

  it("uses stressed English syllables only", () => {
    const pron = { broken: ["B", "R", "OW1", "K", "AH0", "N"], beat: ["B", "IY1", "T"], the: ["DH", "AH0"] };
    const t = segmentLine({ id: "L1", text: "the broken beat", syllableOverride: null }, pron);
    expect(t.find((x) => x.text === "the")?.onset?.label).toBe("/ð/");
    const sec = analyzeSection({ id: "S", type: "verse", label: "V", lines: [{ id: "L1", text: "the broken beat", syllableOverride: null }] }, pron);
    expect(sec.lines[0].alliterations.map((a) => a.label)).toEqual(["/b/"]);
    expect(sec.lines[0].alliterations[0].texts).toHaveLength(2);
  });

  it("finds Thai words with the same initial sound", () => {
    const res = findThaiAlliterations("ใจ", { custom: [], lyricWords: ["จริงใจ", "ใจดี", "ฉัน"] });
    const words = res.map((r) => r.word);
    expect(words).toContain("จริงใจ");
    expect(words).not.toContain("ฉัน");
    expect(res.every((r) => r.label === "/tɕ/")).toBe(true);
  });
});
