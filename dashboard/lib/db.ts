import { Pool } from "pg";
import { NODE_ID } from "./topics";
import type { Sample } from "./types";

/**
 * Read-only window into the tables the EMQX PostgreSQL connector writes.
 *
 * The dashboard never writes history. Two tables feed the charts:
 *   - `public.sdl_sensor_telemetry` — lux / cct (no ts on some rows, fall back to arrived)
 *   - `public.sdl_gw_state`         — target_lux / target_cct / pwm (time = arrived)
 *
 * When the connection string is missing or the server cannot be reached,
 * callers fall back to the in-memory ring buffer.
 */
const connectionString = process.env.DATABASE_URL;
export const dbEnabled = Boolean(connectionString);

/** Do not hammer an unreachable database on every chart refresh. */
const RETRY_AFTER_MS = 30_000;
const CONNECT_TIMEOUT_MS = 3_000;
const MAX_ROWS = 20_000;

interface DbGlobal {
  __sdlPool?: Pool;
  __sdlDbFails?: number;
  __sdlDbLastError?: string | null;
  __sdlDbRetryAt?: number;
  __sdlDbOkAt?: number;
}

const globalRef = globalThis as unknown as DbGlobal;

function pool(): Pool | null {
  if (!connectionString) return null;
  if (!globalRef.__sdlPool) {
    const poolInstance = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 5_000,
      query_timeout: 8_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5_000,
      ssl:
        process.env.DATABASE_SSL === "require"
          ? { rejectUnauthorized: false }
          : undefined,
    });
    poolInstance.on("error", (error) => {
      globalRef.__sdlDbLastError = error.message;
    });
    globalRef.__sdlPool = poolInstance;
  }
  return globalRef.__sdlPool;
}

function fail(error: unknown): null {
  globalRef.__sdlDbFails = (globalRef.__sdlDbFails ?? 0) + 1;
  globalRef.__sdlDbLastError = error instanceof Error ? error.message : String(error);
  globalRef.__sdlDbRetryAt = Date.now() + RETRY_AFTER_MS;
  return null;
}

export interface TargetRow {
  t: number;
  targetLux: number;
  targetCct: number;
  pwm: number;
}

/**
 * Attaches the newest gateway target/PWM snapshot at or before each sample.
 * Both lists must be sorted by time; the walk is linear.
 */
export function mergeTargets(samples: Sample[], targets: TargetRow[]): Sample[] {
  if (targets.length === 0) return samples;
  let index = 0;
  let current: TargetRow | null = null;
  return samples.map((sample) => {
    while (index < targets.length && targets[index].t <= sample.t) {
      current = targets[index];
      index += 1;
    }
    if (!current) return sample;
    return {
      ...sample,
      targetLux: current.targetLux,
      targetCct: current.targetCct,
      pwm: current.pwm,
    };
  });
}

interface SampleRow {
  epoch_s: string | number;
  lux: number | string | null;
  cct: number | string | null;
}

interface StateRow {
  epoch_s: string | number;
  target_lux: number | null;
  target_cct: number | null;
  pwm: number | null;
}

function toSample(row: SampleRow): Sample | null {
  const t = Number(row.epoch_s) * 1000;
  const lux = row.lux == null ? NaN : Number(row.lux);
  if (!Number.isFinite(t) || !Number.isFinite(lux)) return null;
  const rawCct = row.cct == null ? NaN : Number(row.cct);
  return {
    t,
    lux,
    cct: Number.isFinite(rawCct) && rawCct > 0 ? rawCct : undefined,
  };
}

/** A dropped idle connection looks like a timeout or a reset to pg. */
function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code ?? "";
  return (
    /timeout|terminat|closed|ECONNRESET|EPIPE/i.test(message) ||
    ["ECONNRESET", "EPIPE", "ETIMEDOUT", "08000", "08003", "08006", "57P01"].includes(code)
  );
}

async function loadSamples(
  client: Pool,
  nodeId: string,
  sinceSeconds: number,
): Promise<{ samples: Sample[]; targets: TargetRow[] }> {
  const [sampleResult, targetResult] = await Promise.all([
    client.query<SampleRow>(
      `SELECT COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) AS epoch_s,
              lux,
              cct
         FROM public.sdl_sensor_telemetry
        WHERE node_id = $1
          AND lux IS NOT NULL
          AND COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) >= $2
        ORDER BY epoch_s ASC
        LIMIT ${MAX_ROWS}`,
      [nodeId, sinceSeconds],
    ),
    client
      .query<StateRow>(
        `SELECT EXTRACT(EPOCH FROM arrived)::bigint AS epoch_s,
                target_lux,
                target_cct,
                pwm
           FROM public.sdl_gw_state
          WHERE arrived >= to_timestamp($1)
          ORDER BY arrived ASC
          LIMIT 5000`,
        [sinceSeconds],
      )
      .catch(() => ({ rows: [] as StateRow[] })),
  ]);

  const samples = sampleResult.rows
    .map(toSample)
    .filter((sample): sample is Sample => sample !== null);

  const targets: TargetRow[] = targetResult.rows
    .map((row) => ({
      t: Number(row.epoch_s) * 1000,
      targetLux: Number(row.target_lux ?? 0),
      targetCct: Number(row.target_cct ?? 0),
      pwm: Number(row.pwm ?? 0),
    }))
    .filter((row) => Number.isFinite(row.t));

  return { samples, targets };
}

/**
 * Reads lux/cct plus the matching target/PWM rows. A missing `sdl_gw_state`
 * table is not fatal — the samples simply come back without targets.
 *
 * One retry covers the common case of a pooled connection that the network
 * silently dropped while it sat idle.
 */
export async function fetchSamples(
  sinceMs: number,
  nodeId = NODE_ID,
): Promise<Sample[] | null> {
  const client = pool();
  if (!client) return null;
  if ((globalRef.__sdlDbRetryAt ?? 0) > Date.now()) return null;

  const sinceSeconds = Math.floor(sinceMs / 1000);

  try {
    let result;
    try {
      result = await loadSamples(client, nodeId, sinceSeconds);
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      result = await loadSamples(client, nodeId, sinceSeconds);
    }

    globalRef.__sdlDbLastError = null;
    globalRef.__sdlDbRetryAt = 0;
    globalRef.__sdlDbOkAt = Date.now();
    return mergeTargets(result.samples, result.targets);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Opens the first pooled connection in the background so the first chart
 * request does not pay for it (and cannot trip the query timeout).
 */
export function warmDb(): void {
  const client = pool();
  if (!client) return;
  if ((globalRef.__sdlDbOkAt ?? 0) > 0) return;
  void client.query("SELECT 1").catch(() => {
    // a real failure is reported by the first fetchSamples call
  });
}

export function dbStatus() {
  const retryAt = globalRef.__sdlDbRetryAt ?? 0;
  const lastError = globalRef.__sdlDbLastError ?? null;
  const okAt = globalRef.__sdlDbOkAt ?? 0;
  // "unknown" means the dashboard has not queried the database yet.
  const state = !dbEnabled
    ? ("disabled" as const)
    : lastError != null
      ? ("error" as const)
      : okAt > 0
        ? ("ok" as const)
        : ("unknown" as const);

  return {
    enabled: dbEnabled,
    state,
    available: state === "ok" || state === "unknown",
    fails: globalRef.__sdlDbFails ?? 0,
    lastError,
    lastOkAt: okAt > 0 ? okAt : null,
    retryInMs: Math.max(0, retryAt - Date.now()),
  };
}
