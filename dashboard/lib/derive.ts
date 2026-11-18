import { clamp } from "./format";
import { NODE_ID, SENSOR_STATUS_FRESH_S } from "./topics";
import type { Mode, PublicState } from "./types";

export type LampState =
  | "waiting"
  | "steady"
  | "adjusting"
  | "away"
  | "emergency"
  | "fault"
  | "stale"
  | "offline";

export type Tone = "ok" | "warn" | "alert" | "safe" | "idle";

export interface StateMeta {
  th: string;
  en: string;
  tone: Tone;
}

export const STATE_META: Record<LampState, StateMeta> = {
  waiting: { th: "รอข้อมูล", en: "Waiting", tone: "idle" },
  steady: { th: "นิ่งแล้ว", en: "Steady", tone: "ok" },
  adjusting: { th: "กำลังปรับ", en: "Adjusting", tone: "warn" },
  away: { th: "ไม่มีคนที่โต๊ะ", en: "Away", tone: "idle" },
  emergency: { th: "หยุดฉุกเฉิน", en: "Safe mode", tone: "safe" },
  fault: { th: "เซนเซอร์ขัดข้อง", en: "Sensor fault", tone: "alert" },
  stale: { th: "ข้อมูลเก่า", en: "Stale", tone: "warn" },
  offline: { th: "ออฟไลน์", en: "Offline", tone: "alert" },
};

export const TOLERANCE_PCT = 7;
export const STALE_SNAPSHOT_MS = 45_000;
export const STALE_TELEMETRY_MS = 6_000;
export const NODE_FAULT_AGE_S = 10;

export interface Derived {
  state: LampState;
  meta: StateMeta;
  mode: Mode;
  lux: number | null;
  cct: number | null;
  targetLux: number;
  targetCct: number;
  pwm: number;
  pwmPct: number;
  powerMw: number | null;
  powerW: number | null;
  voltage: number | null;
  currentMa: number | null;
  presence: boolean;
  safe: boolean;
  ai: boolean;
  distanceMm: number | null;
  errorPct: number | null;
  inTolerance: boolean;
  successRate: number | null;
  nodeOnline: boolean;
  rgb: { r: number | null; g: number | null; b: number | null; c: number | null };
  buffered: number;
  dropped: number;
  uptimeS: number | null;
  heap: number | null;
  heapMin: number | null;
  rssi: number | null;
  reset: string | null;
  filters: [boolean, boolean, boolean];
  lastSeenAt: number | null;
}

const MODE_VALUES: Mode[] = ["reading", "coding", "drawing"];

export function asMode(value: unknown): Mode {
  return MODE_VALUES.includes(value as Mode) ? (value as Mode) : "reading";
}

/** The retained presence map only counts while the gateway is alive. */
export function nodeOnline(state: PublicState, now = Date.now()): boolean {
  const { status, statusAt, telemetryAt } = state.sensors;
  const fresh = statusAt != null && now - statusAt < SENSOR_STATUS_FRESH_S * 1000;
  if (fresh && status && status[NODE_ID] === "offline") return false;
  if (state.status === "offline") return false;
  if (state.sensors.telemetry == null) return false;
  return telemetryAt != null && now - telemetryAt <= STALE_TELEMETRY_MS;
}

export function derive(state: PublicState, now = Date.now()): Derived {
  const snapshot = state.snapshot;
  const gateway = state.gateway;
  const { telemetry, health } = state.sensors;

  const rawCct = telemetry?.cct ?? snapshot?.n1_cct;
  const lux = telemetry?.lux ?? snapshot?.n1_lux ?? null;
  const cct = rawCct != null && rawCct > 0 ? rawCct : null;
  const targetLux = snapshot?.target_lux ?? 500;
  const targetCct = snapshot?.target_cct ?? 4000;
  const pwm = clamp(snapshot?.pwm ?? 0, 0, 255);
  const presence = snapshot?.presence !== 0;
  const safe = snapshot?.safe === 1 || gateway?.safe === 1;

  const snapshotAge = state.snapshotAt == null ? Infinity : now - state.snapshotAt;
  const telemetryAge = state.sensors.telemetryAt == null ? Infinity : now - state.sensors.telemetryAt;
  const nodeAge = snapshot?.n1_age_s ?? 0;
  const online = nodeOnline(state, now);

  const errorPct =
    lux != null && targetLux > 0 ? ((lux - targetLux) / targetLux) * 100 : null;
  const inTolerance = errorPct != null && Math.abs(errorPct) <= TOLERANCE_PCT;

  let lampState: LampState;
  if (state.link === "offline" || state.link === "error" || state.status === "offline") {
    lampState = "offline";
  } else if (!snapshot) {
    lampState = "waiting";
  } else if (snapshotAge > STALE_SNAPSHOT_MS && telemetryAge > STALE_TELEMETRY_MS) {
    lampState = "stale";
  } else if (safe) {
    lampState = "emergency";
  } else if (!online || nodeAge > NODE_FAULT_AGE_S) {
    lampState = "fault";
  } else if (!presence) {
    lampState = "away";
  } else if (inTolerance) {
    lampState = "steady";
  } else {
    lampState = "adjusting";
  }

  const attempts = health?.tx_attempts ?? 0;
  const acked = health?.tx_acked ?? 0;
  const successRate =
    attempts > 0
      ? clamp((acked / attempts) * 100, 0, 100)
      : (snapshot?.n1_seq ?? 0) > 0
        ? clamp(((snapshot?.n1_rx ?? 0) / (snapshot?.n1_seq ?? 1)) * 100, 0, 100)
        : null;

  const powerMw = snapshot?.lamp_mW ?? null;

  return {
    state: lampState,
    meta: STATE_META[lampState],
    mode: asMode(snapshot?.mode ?? gateway?.mode),
    lux,
    cct,
    targetLux,
    targetCct,
    pwm,
    pwmPct: (pwm / 255) * 100,
    powerMw,
    powerW: powerMw == null ? null : powerMw / 1000,
    voltage: snapshot?.bus_V ?? null,
    currentMa: snapshot?.current_mA ?? null,
    presence,
    safe,
    ai: snapshot?.ai === 1,
    distanceMm: snapshot?.dist_mm ? snapshot.dist_mm : null,
    errorPct,
    inTolerance,
    successRate,
    nodeOnline: online,
    rgb: {
      r: telemetry?.r ?? null,
      g: telemetry?.g ?? null,
      b: telemetry?.b ?? null,
      c: telemetry?.c ?? null,
    },
    buffered: snapshot?.buffered ?? gateway?.buffered ?? 0,
    dropped: snapshot?.dropped ?? gateway?.dropped ?? 0,
    uptimeS: gateway?.uptime_s ?? snapshot?.uptime_s ?? health?.uptime_s ?? null,
    heap: gateway?.heap ?? health?.heap ?? snapshot?.heap ?? null,
    heapMin: gateway?.heap_min ?? health?.heap_min ?? null,
    rssi: gateway?.rssi ?? null,
    reset: typeof gateway?.reset === "string" ? gateway.reset : null,
    filters: [
      snapshot?.diffuser === 1,
      snapshot?.nd === 1,
      snapshot?.warm === 1,
    ],
    lastSeenAt:
      state.snapshotAt == null && state.sensors.telemetryAt == null
        ? null
        : Math.max(state.snapshotAt ?? 0, state.sensors.telemetryAt ?? 0),
  };
}
