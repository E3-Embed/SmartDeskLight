import { dbEnabled, initDb, insertSamples } from "../db";
import { mockScenario, startMock } from "../mock";
import { setSource, subscribe } from "../store";
import type { SourceKind } from "../types";
import { startMqtt } from "./mqtt";
import { startNetpie } from "./netpie";

interface SourceGlobal {
  __sdlSourceStarted?: boolean;
  __sdlDbWriterStarted?: boolean;
}

const globalRef = globalThis as unknown as SourceGlobal;

export function sourceKind(): SourceKind {
  if (process.env.SOURCE === "mqtt") return "mqtt";
  if (process.env.SOURCE === "netpie") return "netpie";
  return "mock";
}

function attachDbWriter(): void {
  if (globalRef.__sdlDbWriterStarted || !dbEnabled) return;
  globalRef.__sdlDbWriterStarted = true;

  void initDb();

  let buffer: Parameters<typeof insertSamples>[0] = [];
  let flushing = false;

  const flush = async () => {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const rows = buffer;
    buffer = [];
    await insertSamples(rows);
    flushing = false;
  };

  subscribe(({ sample }) => {
    if (sample) buffer.push(sample);
    if (buffer.length >= 60) void flush();
  });

  const timer = setInterval(() => void flush(), 5000);
  timer.unref?.();
}

/** Starts the data source exactly once per server process. */
export function ensureSource(): SourceKind {
  const kind = sourceKind();
  setSource(kind);
  if (globalRef.__sdlSourceStarted) return kind;
  globalRef.__sdlSourceStarted = true;

  if (kind === "mqtt") startMqtt();
  else if (kind === "netpie") startNetpie();
  else startMock();

  if (dbEnabled) attachDbWriter();
  return kind;
}

export function currentScenario(): string | null {
  return sourceKind() === "mock" ? mockScenario() : null;
}
