import { describe, expect, it } from "vitest";
import { mergeTargets } from "./db";

const s = (t: number, lux: number): { t: number; lux: number } => ({ t, lux });

describe("mergeTargets", () => {
  it("returns samples untouched when the gateway table has no rows", () => {
    const samples = [s(1000, 10), s(2000, 20)];
    expect(mergeTargets(samples, [])).toEqual(samples);
  });

  it("attaches the newest target at or before each sample", () => {
    const samples = [s(1_000, 10), s(2_500, 20), s(6_000, 30)];
    const targets = [
      { t: 0, targetLux: 500, targetCct: 4000, pwm: 100 },
      { t: 2_000, targetLux: 300, targetCct: 4500, pwm: 140 },
      { t: 5_500, targetLux: 700, targetCct: 5000, pwm: 200 },
    ];

    expect(mergeTargets(samples, targets)).toEqual([
      { t: 1_000, lux: 10, targetLux: 500, targetCct: 4000, pwm: 100 },
      { t: 2_500, lux: 20, targetLux: 300, targetCct: 4500, pwm: 140 },
      { t: 6_000, lux: 30, targetLux: 700, targetCct: 5000, pwm: 200 },
    ]);
  });

  it("leaves samples before the first target row untouched", () => {
    const samples = [s(1_000, 10), s(3_000, 20)];
    const targets = [{ t: 2_000, targetLux: 300, targetCct: 4500, pwm: 140 }];
    expect(mergeTargets(samples, targets)).toEqual([
      { t: 1_000, lux: 10 },
      { t: 3_000, lux: 20, targetLux: 300, targetCct: 4500, pwm: 140 },
    ]);
  });
});
