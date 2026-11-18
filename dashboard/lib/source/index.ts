import { dbEnabled, warmDb } from "../db";
import { mockScenario, startMock } from "../mock";
import { setSource } from "../store";
import type { SourceKind } from "../types";
import { startMqtt } from "./mqtt";

interface SourceGlobal {
  __sdlSourceStarted?: boolean;
}

const globalRef = globalThis as unknown as SourceGlobal;

export function sourceKind(): SourceKind {
  return process.env.SOURCE === "mqtt" ? "mqtt" : "mock";
}

/**
 * Starts the data source exactly once per server process.
 *
 * History is read-only: EMQX writes the Postgres tables, so the dashboard
 * never attaches a database writer.
 */
export function ensureSource(): SourceKind {
  const kind = sourceKind();
  setSource(kind);
  if (globalRef.__sdlSourceStarted) return kind;
  globalRef.__sdlSourceStarted = true;

  if (kind === "mqtt") startMqtt();
  else startMock();

  if (dbEnabled) warmDb();

  return kind;
}

export function currentScenario(): string | null {
  return sourceKind() === "mock" ? mockScenario() : null;
}
