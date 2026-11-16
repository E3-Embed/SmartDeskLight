import type { Sample } from "./types";

export interface HistoryRange {
  id: string;
  labelTh: string;
  labelEn: string;
  ms: number;
  bucketMs: number;
}

export const HISTORY_RANGES: HistoryRange[] = [
  { id: "5m", labelTh: "5 นาที", labelEn: "5 min", ms: 5 * 60_000, bucketMs: 0 },
  { id: "30m", labelTh: "30 นาที", labelEn: "30 min", ms: 30 * 60_000, bucketMs: 10_000 },
  { id: "2h", labelTh: "2 ชั่วโมง", labelEn: "2 h", ms: 2 * 60 * 60_000, bucketMs: 30_000 },
];

export function rangeById(id: string | null): HistoryRange {
  return HISTORY_RANGES.find((range) => range.id === id) ?? HISTORY_RANGES[0];
}

/** Averages samples into buckets so the chart never draws more than ~240 points. */
export function downsample(samples: Sample[], bucketMs: number): Sample[] {
  if (samples.length === 0) return [];
  if (bucketMs <= 0) return samples.slice(-240);

  const buckets = new Map<number, { sum: Sample; count: number }>();
  for (const sample of samples) {
    const key = Math.floor(sample.t / bucketMs) * bucketMs;
    const entry = buckets.get(key);
    if (entry) {
      entry.sum.lux += sample.lux;
      entry.sum.cct += sample.cct;
      entry.sum.targetLux += sample.targetLux;
      entry.sum.targetCct += sample.targetCct;
      entry.sum.pwm += sample.pwm;
      entry.count += 1;
    } else {
      buckets.set(key, { sum: { ...sample, t: key }, count: 1 });
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, { sum, count }]) => ({
      t: sum.t,
      lux: Number((sum.lux / count).toFixed(1)),
      cct: Math.round(sum.cct / count),
      targetLux: Math.round(sum.targetLux / count),
      targetCct: Math.round(sum.targetCct / count),
      pwm: Math.round(sum.pwm / count),
    }));
}
