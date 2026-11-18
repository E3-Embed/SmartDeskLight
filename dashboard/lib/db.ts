import { Pool } from "pg";
import { NODE_ID } from "./topics";
import type { Sample } from "./types";

/**
 * Read-only window into the table EMQX writes.
 *
 * The dashboard never writes history: the EMQX PostgreSQL connector owns
 * `public.sdl_sensor_telemetry`. When the connection string is missing or the
 * server cannot be reached, callers fall back to the in-memory ring buffer.
 */
const connectionString = process.env.DATABASE_URL;
export const dbEnabled = Boolean(connectionString);

/** Do not hammer an unreachable database on every chart refresh. */
const RETRY_AFTER_MS = 30_000;
const CONNECT_TIMEOUT_MS = 3_000;

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
      max: 2,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 10_000,
      query_timeout: 5_000,
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

interface HistoryRow {
  epoch_s: string | number;
  lux: number | string | null;
  cct: number | string | null;
}

/**
 * Reads `public.sdl_sensor_telemetry`. Rows carry lux/cct only, so the Sample
 * targets stay undefined and the charts hide those lines.
 */
export async function fetchSamples(
  sinceMs: number,
  nodeId = NODE_ID,
): Promise<Sample[] | null> {
  const client = pool();
  if (!client) return null;
  if ((globalRef.__sdlDbRetryAt ?? 0) > Date.now()) return null;

  try {
    const result = await client.query<HistoryRow>(
      `SELECT COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) AS epoch_s,
              lux,
              cct
         FROM public.sdl_sensor_telemetry
        WHERE node_id = $1
          AND lux IS NOT NULL
          AND COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) >= $2
        ORDER BY epoch_s ASC
        LIMIT 20000`,
      [nodeId, Math.floor(sinceMs / 1000)],
    );

    const samples: Sample[] = [];
    for (const row of result.rows) {
      const t = Number(row.epoch_s) * 1000;
      const lux = row.lux == null ? NaN : Number(row.lux);
      if (!Number.isFinite(t) || !Number.isFinite(lux)) continue;
      const rawCct = row.cct == null ? NaN : Number(row.cct);
      samples.push({
        t,
        lux,
        cct: Number.isFinite(rawCct) && rawCct > 0 ? rawCct : undefined,
      });
    }

    globalRef.__sdlDbLastError = null;
    globalRef.__sdlDbRetryAt = 0;
    globalRef.__sdlDbOkAt = Date.now();
    return samples;
  } catch (error) {
    return fail(error);
  }
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
