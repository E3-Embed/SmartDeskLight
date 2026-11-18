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

interface Bucket {
  t: number;
  count: number;
  lux: number;
  cct: { sum: number; n: number };
  targetLux: { sum: number; n: number };
  targetCct: { sum: number; n: number };
  pwm: { sum: number; n: number };
}

function add(acc: { sum: number; n: number }, value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return;
  acc.sum += value;
  acc.n += 1;
}

function average(acc: { sum: number; n: number }): number | undefined {
  return acc.n > 0 ? acc.sum / acc.n : undefined;
}

/**
 * Averages samples into buckets so the chart never draws more than ~240 points.
 * Optional fields stay absent when no sample in the bucket carried them — that
 * is how 30 min / 2 h history from Postgres loses its target and PWM lines.
 */
export function downsample(samples: Sample[], bucketMs: number): Sample[] {
  if (samples.length === 0) return [];
  if (bucketMs <= 0) return samples.slice(-240);

  const buckets = new Map<number, Bucket>();
  for (const sample of samples) {
    const key = Math.floor(sample.t / bucketMs) * bucketMs;
    const entry = buckets.get(key);
    if (entry) {
      entry.count += 1;
      entry.lux += sample.lux;
      add(entry.cct, sample.cct);
      add(entry.targetLux, sample.targetLux);
      add(entry.targetCct, sample.targetCct);
      add(entry.pwm, sample.pwm);
    } else {
      buckets.set(key, {
        t: key,
        count: 1,
        lux: sample.lux,
        cct: { sum: 0, n: 0 },
        targetLux: { sum: 0, n: 0 },
        targetCct: { sum: 0, n: 0 },
        pwm: { sum: 0, n: 0 },
      });
      if (sample.cct != null) add(buckets.get(key)!.cct, sample.cct);
      if (sample.targetLux != null) add(buckets.get(key)!.targetLux, sample.targetLux);
      if (sample.targetCct != null) add(buckets.get(key)!.targetCct, sample.targetCct);
      if (sample.pwm != null) add(buckets.get(key)!.pwm, sample.pwm);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, bucket]) => {
      const sample: Sample = {
        t: bucket.t,
        lux: Number((bucket.lux / bucket.count).toFixed(1)),
      };
      const cct = average(bucket.cct);
      if (cct != null) sample.cct = Math.round(cct);
      const targetLux = average(bucket.targetLux);
      if (targetLux != null) sample.targetLux = Math.round(targetLux);
      const targetCct = average(bucket.targetCct);
      if (targetCct != null) sample.targetCct = Math.round(targetCct);
      const pwm = average(bucket.pwm);
      if (pwm != null) sample.pwm = Math.round(pwm);
      return sample;
    });
}
