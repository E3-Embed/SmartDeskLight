import { fetchSamples } from "@/lib/db";
import { downsample, rangeById } from "@/lib/history";
import { fetchFeed } from "@/lib/netpie/feed";
import { ensureSource } from "@/lib/source";
import { getSamples } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const source = ensureSource();

  const url = new URL(request.url);
  const range = rangeById(url.searchParams.get("range"));
  const since = Date.now() - range.ms;

  if (source === "netpie") {
    const feed = await fetchFeed(since);
    if (feed && feed.length > 0) {
      return Response.json({
        range: range.id,
        source: "netpie-feed",
        samples: downsample(feed, range.bucketMs),
        serverTime: Date.now(),
      });
    }
  }

  const fromDb = await fetchSamples(since);
  const samples = fromDb ?? getSamples(since);

  return Response.json({
    range: range.id,
    source: fromDb ? "postgres" : "memory",
    samples: downsample(samples, range.bucketMs),
    serverTime: Date.now(),
  });
}
