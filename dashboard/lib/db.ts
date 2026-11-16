import { Pool } from "pg";
import type { Sample } from "./types";

const connectionString = process.env.DATABASE_URL;
export const dbEnabled = Boolean(connectionString);

interface DbGlobal {
  __sdlPool?: Pool;
  __sdlDbReady?: Promise<void>;
  __sdlDbFails?: number;
  __sdlDbLastError?: string | null;
}

const globalRef = globalThis as unknown as DbGlobal;

function pool(): Pool | null {
  if (!connectionString) return null;
  if (!globalRef.__sdlPool) {
    globalRef.__sdlPool = new Pool({ connectionString, max: 3 });
    globalRef.__sdlPool.on("error", (error) => {
      globalRef.__sdlDbLastError = error.message;
    });
  }
  return globalRef.__sdlPool;
}

async function migrate(): Promise<void> {
  const client = pool();
  if (!client) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS samples (
      ts         timestamptz NOT NULL,
      lux        double precision NOT NULL,
      cct        double precision NOT NULL,
      target_lux double precision NOT NULL,
      target_cct double precision NOT NULL,
      pwm        smallint NOT NULL
    );
  `);
  await client.query(
    "CREATE INDEX IF NOT EXISTS samples_ts_idx ON samples (ts DESC);",
  );
  await client.query(
    "DELETE FROM samples WHERE ts < now() - interval '7 days';",
  );
}

export function initDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!globalRef.__sdlDbReady) {
    globalRef.__sdlDbReady = migrate().catch((error: unknown) => {
      globalRef.__sdlDbFails = (globalRef.__sdlDbFails ?? 0) + 1;
      globalRef.__sdlDbLastError =
        error instanceof Error ? error.message : String(error);
    });
  }
  return globalRef.__sdlDbReady;
}

export async function insertSamples(rows: Sample[]): Promise<boolean> {
  const client = pool();
  if (!client || rows.length === 0) return false;
  try {
    await client.query(
      `INSERT INTO samples (ts, lux, cct, target_lux, target_cct, pwm)
       SELECT * FROM unnest(
         $1::timestamptz[],
         $2::double precision[],
         $3::double precision[],
         $4::double precision[],
         $5::double precision[],
         $6::smallint[]
       )`,
      [
        rows.map((row) => new Date(row.t)),
        rows.map((row) => row.lux),
        rows.map((row) => row.cct),
        rows.map((row) => row.targetLux),
        rows.map((row) => row.targetCct),
        rows.map((row) => Math.round(row.pwm)),
      ],
    );
    return true;
  } catch (error) {
    globalRef.__sdlDbFails = (globalRef.__sdlDbFails ?? 0) + 1;
    globalRef.__sdlDbLastError =
      error instanceof Error ? error.message : String(error);
    return false;
  }
}

export async function fetchSamples(sinceMs: number): Promise<Sample[] | null> {
  const client = pool();
  if (!client) return null;
  try {
    const result = await client.query<{
      ts: Date;
      lux: number;
      cct: number;
      target_lux: number;
      target_cct: number;
      pwm: number;
    }>(
      `SELECT ts, lux, cct, target_lux, target_cct, pwm
         FROM samples
        WHERE ts >= to_timestamp($1 / 1000.0)
        ORDER BY ts ASC
        LIMIT 20000`,
      [sinceMs],
    );
    return result.rows.map((row) => ({
      t: row.ts.getTime(),
      lux: Number(row.lux),
      cct: Number(row.cct),
      targetLux: Number(row.target_lux),
      targetCct: Number(row.target_cct),
      pwm: Number(row.pwm),
    }));
  } catch (error) {
    globalRef.__sdlDbFails = (globalRef.__sdlDbFails ?? 0) + 1;
    globalRef.__sdlDbLastError =
      error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function dbStatus() {
  return {
    enabled: dbEnabled,
    fails: globalRef.__sdlDbFails ?? 0,
    lastError: globalRef.__sdlDbLastError ?? null,
  };
}
