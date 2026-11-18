import type {
  GatewaySnapshot,
  GatewayTelemetry,
  SensorHealth,
  SensorStatus,
  SensorTelemetry,
} from "./types";

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

function asObject<T>(payload: string): T | null {
  const root = parseJsonObject(payload);
  if (!root) return null;
  const cleaned = clean(root);
  return Object.keys(cleaned).length > 0 ? (cleaned as T) : null;
}

/**
 * `@msg/sdl/gw/state` is a flat object. Older NETPIE payloads wrapped it in
 * `{ data: … }`, which is still accepted so the legacy source keeps working.
 */
export function parseSnapshot(payload: string): GatewaySnapshot | null {
  const root = parseJsonObject(payload);
  if (!root) return null;
  const body = isRecord(root.data) ? root.data : root;
  const cleaned = clean(body);
  return Object.keys(cleaned).length > 0 ? (cleaned as GatewaySnapshot) : null;
}

export function parseGatewayTelemetry(payload: string): GatewayTelemetry | null {
  return asObject<GatewayTelemetry>(payload);
}

export function parseSensorHealth(payload: string): SensorHealth | null {
  return asObject<SensorHealth>(payload);
}

/**
 * `cct = 0` means the reading was not trustworthy (too dark / saturated), so
 * the field is dropped instead of being drawn as a 0 K sample.
 */
export function parseSensorTelemetry(payload: string): SensorTelemetry | null {
  const telemetry = asObject<SensorTelemetry>(payload);
  if (!telemetry) return null;
  if (typeof telemetry.cct !== "number" || telemetry.cct <= 0) delete telemetry.cct;
  return telemetry;
}

/** Retained presence map: `{"ts":1794992731,"N1":"online"}`. */
export function parseSensorStatus(payload: string): SensorStatus | null {
  return asObject<SensorStatus>(payload);
}

export function parseStatus(payload: string): "online" | "offline" | null {
  const text = payload.trim().replace(/^"|"$/g, "").toLowerCase();
  if (text === "online" || text === "offline") return text;
  return null;
}

/** `alert` carries plain text; `{"text":…}` is accepted too. */
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
