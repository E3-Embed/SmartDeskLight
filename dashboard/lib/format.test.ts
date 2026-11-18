import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatLux,
  formatPercent,
  formatWatts,
} from "./format";
import { downsample } from "./history";
import type { Sample } from "./types";

describe("format", () => {
  it("formats lux and watts", () => {
    expect(formatLux(412.6)).toBe("413");
    expect(formatLux(null)).toBe("—");
    expect(formatWatts(3120)).toBe("3.1");
  });

  it("formats signed percentages", () => {
    expect(formatPercent(-3.24)).toBe("-3.2%");
    expect(formatPercent(12.04)).toBe("+12.0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formats durations in Thai units", () => {
    expect(formatDuration(45)).toBe("45 วิ");
    expect(formatDuration(125)).toBe("2 น.");
    expect(formatDuration(2 * 3600 + 14 * 60)).toBe("2 ชม. 14 น.");
  });
});

describe("downsample", () => {
  it("averages samples into buckets", () => {
    const samples: Sample[] = [0, 1000, 2000, 3000].map((offset, index) => ({
      t: offset,
      lux: 100 + index * 10,
      cct: 4000,
      targetLux: 500,
      targetCct: 4000,
      pwm: 120,
    }));

    const result = downsample(samples, 2000);
    expect(result).toHaveLength(2);
    expect(result[0].lux).toBeCloseTo(105, 1);
    expect(result[1].lux).toBeCloseTo(125, 1);
  });

  it("returns an empty list for no samples", () => {
    expect(downsample([], 1000)).toEqual([]);
  });
});
