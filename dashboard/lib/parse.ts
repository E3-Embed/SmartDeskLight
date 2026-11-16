import type { Shadow, Sys, Telemetry } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clean(record: Record<string, unknown>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** The gateway publishes `{ "data": { ...fields } }` on @shadow/data/update. */
export function parseShadow(payload: string): Shadow | null {
  const root = parseJsonObject(payload);
  if (!root) return null;
  const body = isRecord(root.data) ? root.data : root;
  const cleaned = clean(body);
  return Object.keys(cleaned).length > 0 ? (cleaned as Shadow) : null;
}

export function parseSys(payload: string): Sys | null {
  const root = parseJsonObject(payload);
  if (!root) return null;
  const cleaned = clean(root);
  return Object.keys(cleaned).length > 0 ? (cleaned as Sys) : null;
}

export function parseTelemetry(payload: string): Telemetry | null {
  const root = parseJsonObject(payload);
  if (!root) return null;
  const cleaned = clean(root);
  return Object.keys(cleaned).length > 0 ? (cleaned as Telemetry) : null;
}

export function parseStatus(payload: string): "online" | "offline" | null {
  const text = payload.trim().replace(/^"|"$/g, "").toLowerCase();
  if (text === "online" || text === "offline") return text;
  return null;
}

export function parseAlert(payload: string): string | null {
  const text = payload.trim();
  if (!text) return null;
  const root = parseJsonObject(text);
  if (root) {
    const candidate = root.text ?? root.message ?? root.alert;
    if (typeof candidate === "string") return candidate;
  }
  return text.replace(/^"|"$/g, "");
}
