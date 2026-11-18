import { dbStatus } from "@/lib/db";
import { ensureSource, sourceKind } from "@/lib/source";
import { sampleCount, snapshot } from "@/lib/store";
import { nodeOnline } from "@/lib/derive";
import { NODE_ID } from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ageS(at: number | null, now: number): number | null {
  return at == null ? null : Math.round((now - at) / 1000);
}

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
    node: NODE_ID,
    nodeOnline: nodeOnline(state, now),
    brokerSourceMatchesEnv: source === sourceKind(),
    ages: {
      statusS: ageS(state.statusAt, now),
      snapshotS: ageS(state.snapshotAt, now),
      gatewayS: ageS(state.gatewayAt, now),
      telemetryS: ageS(state.sensors.telemetryAt, now),
      healthS: ageS(state.sensors.healthAt, now),
      sensorsS: ageS(state.sensors.statusAt, now),
    },
    samples: sampleCount(),
    alerts: state.alerts.length,
    db: dbStatus(),
    serverTime: now,
  });
}
