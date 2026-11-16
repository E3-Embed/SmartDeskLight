import { dbStatus } from "@/lib/db";
import { ensureSource, sourceKind } from "@/lib/source";
import { sampleCount, snapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const source = ensureSource();
  const state = snapshot();
  const now = Date.now();

  return Response.json({
    ok: true,
    source,
    link: state.link,
    linkError: state.linkError,
    status: state.status,
    brokerSourceMatchesEnv: source === sourceKind(),
    ages: {
      shadowS: state.shadowAt ? Math.round((now - state.shadowAt) / 1000) : null,
      sysS: state.sysAt ? Math.round((now - state.sysAt) / 1000) : null,
      telemetryS: state.telemetryAt
        ? Math.round((now - state.telemetryAt) / 1000)
        : null,
    },
    samples: sampleCount(),
    alerts: state.alerts.length,
    db: dbStatus(),
    serverTime: now,
  });
}
