import { describe, expect, it } from "vitest";
import { PPQ, barBeatToTick, formatBarBeat, gridById, metricStrength, secondsToTicks, snapTick, tickToBarBeat, ticksPerBar, ticksPerBeat, ticksToSeconds } from "./timing";

describe("timing model", () => {
  it("converts ticks and seconds at a tempo", () => {
    expect(ticksToSeconds(PPQ, 120)).toBeCloseTo(0.5);
    expect(ticksToSeconds(PPQ * 4, 60)).toBeCloseTo(4);
    expect(secondsToTicks(0.5, 120)).toBeCloseTo(PPQ);
    expect(secondsToTicks(ticksToSeconds(1234, 87), 87)).toBeCloseTo(1234);
  });

  it("computes bar and beat lengths for compound and simple meters", () => {
    expect(ticksPerBar({ numerator: 4, denominator: 4 })).toBe(1920);
    expect(ticksPerBeat({ numerator: 6, denominator: 8 })).toBe(240);
    expect(ticksPerBar({ numerator: 6, denominator: 8 })).toBe(1440);
    expect(ticksPerBar({ numerator: 3, denominator: 4 })).toBe(1440);
  });

  it("snaps to straight and triplet grids", () => {
    expect(snapTick(130, gridById("1/16").ticks)).toBe(120);
    expect(snapTick(179, gridById("1/16").ticks, "floor")).toBe(120);
    expect(snapTick(121, gridById("1/16").ticks, "ceil")).toBe(240);
    expect(gridById("1/8T").ticks).toBe(160);
    expect(snapTick(250, gridById("1/8T").ticks)).toBe(320);
    expect(snapTick(5, 0)).toBe(5);
  });

  it("round-trips bar/beat positions", () => {
    const ts = { numerator: 4, denominator: 4 };
    const pos = tickToBarBeat(1920 * 2 + 480 + 120, ts);
    expect(pos).toEqual({ bar: 3, beat: 2, tick: 120 });
    expect(barBeatToTick(pos, ts)).toBe(1920 * 2 + 600);
    expect(formatBarBeat(0, ts)).toBe("1.1.1");
    expect(formatBarBeat(1920 + 480 * 3 + 360, ts)).toBe("2.4.4");
  });

  it("rates metric strength", () => {
    const ts = { numerator: 4, denominator: 4 };
    expect(metricStrength(0, ts)).toBe(3);
    expect(metricStrength(480, ts)).toBe(2);
    expect(metricStrength(240, ts)).toBe(1);
    expect(metricStrength(120, ts)).toBe(0);
  });
});
