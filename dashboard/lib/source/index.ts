import { mockScenario, startMock } from "../mock";
import { setSource } from "../store";
import { TOPIC_CMD } from "../topics";
import type { SourceKind } from "../types";
import { startMqtt } from "./mqtt";
import { startNetpie } from "./netpie";

interface SourceGlobal {
  __sdlSourceStarted?: boolean;
}

const globalRef = globalThis as unknown as SourceGlobal;

export function sourceKind(): SourceKind {
  if (process.env.SOURCE === "mqtt") return "mqtt";
  if (process.env.SOURCE === "netpie") return "netpie";
  return "mock";
}

/**
 * Starts the data source exactly once per server process.
 *
 * History is read-only: EMQX writes `public.sdl_sensor_telemetry`, so the
 * dashboard never attaches a database writer.
 */
export function ensureSource(): SourceKind {
  const kind = sourceKind();
  setSource(kind);
  if (globalRef.__sdlSourceStarted) return kind;
  globalRef.__sdlSourceStarted = true;

  if (kind === "mqtt") startMqtt();
  else if (kind === "netpie") startNetpie();
  else startMock();

  return kind;
}

export function currentScenario(): string | null {
  return sourceKind() === "mock" ? mockScenario() : null;
}
