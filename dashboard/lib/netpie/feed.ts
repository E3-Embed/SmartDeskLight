import type { Sample } from "../types";

const FEED_API = "https://ds.netpie.io/feed/api/v1/datapoints/query";

interface FeedGroup {
  group_by?: { name?: string; tags?: { attr?: string | string[] } }[];
  tags?: { attr?: string | string[] };
  values?: [number, number][];
}

interface FeedResponse {
  queries?: { results?: FeedGroup[] }[];
}

function attrOf(group: FeedGroup): string | null {
  const fromGroupBy = group.group_by?.find((item) => item.name === "tag")?.tags?.attr;
  const raw = fromGroupBy ?? group.tags?.attr;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

async function queryMetric(metric: string, sinceMs: number): Promise<Sample[]> {
  const clientId = process.env.NETPIE_CLIENT_ID;
  const token = process.env.NETPIE_TOKEN;
  if (!clientId || !token) return [];

  const response = await fetch(FEED_API, {
    method: "POST",
    headers: {
      Authorization: `Device ${clientId}:${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      start_absolute: sinceMs,
      metrics: [{ name: metric, limit: 6000 }],
    }),
  });

  if (!response.ok) return [];
  const json = (await response.json()) as FeedResponse;

  const rows = new Map<number, Sample>();
  for (const query of json.queries ?? []) {
    for (const group of query.results ?? []) {
      const field = attrOf(group);
      if (!field) continue;
      for (const point of group.values ?? []) {
        const t = Number(point[0]);
        const value = Number(point[1]);
        if (!Number.isFinite(t) || !Number.isFinite(value)) continue;
        const row = rows.get(t) ?? {
          t,
          lux: 0,
          cct: 0,
          targetLux: 500,
          targetCct: 4000,
          pwm: 0,
        };
        if (field === "n1_lux" || field === "lux") row.lux = value;
        else if (field === "n1_cct" || field === "cct") row.cct = value;
        else if (field === "target_lux") row.targetLux = value;
        else if (field === "target_cct") row.targetCct = value;
        else if (field === "pwm") row.pwm = value;
        rows.set(t, row);
      }
    }
  }

  return [...rows.values()]
    .filter((row) => row.lux > 0)
    .sort((a, b) => a.t - b.t);
}

export async function fetchFeed(sinceMs: number): Promise<Sample[] | null> {
  const candidates = [
    process.env.NETPIE_FEED_METRIC,
    process.env.NETPIE_DEVICE_ALIAS,
    process.env.NETPIE_CLIENT_ID,
  ].filter((value): value is string => Boolean(value));

  for (const metric of [...new Set(candidates)]) {
    try {
      const samples = await queryMetric(metric, sinceMs);
      if (samples.length > 0) return samples;
    } catch {
      // try the next candidate metric name
    }
  }
  return null;
}
