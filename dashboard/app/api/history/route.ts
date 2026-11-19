import { dbStatus, fetchSamples } from "@/lib/db";
import { downsample, rangeById } from "@/lib/history";
import { ensureSource } from "@/lib/source";
import { getSamples } from "@/lib/store";
import type { Sample } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const source = ensureSource();

  const url = new URL(request.url);
  const range = rangeById(url.searchParams.get("range"));
  const since = Date.now() - range.ms;

  // EMQX owns the history tables, so the dashboard only reads from them. When
  // the database is unreachable the in-memory ring buffer keeps the charts alive.
  const fromDb = source === "mqtt" ? await fetchSamples(since) : null;
  const usingDb = fromDb != null && fromDb.length > 0;
  const samples: Sample[] = usingDb ? fromDb : getSamples(since);

  return Response.json({
    range: range.id,
    source: usingDb ? "postgres" : "memory",
    db: dbStatus(),
    samples: downsample(samples, range.bucketMs),
    serverTime: Date.now(),
  });
}
