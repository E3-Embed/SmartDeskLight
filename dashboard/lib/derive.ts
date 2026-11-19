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

export type PresenceSource = "pir" | "tof" | "pir+tof" | "none";

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
  energyWh: number | null;
  voltage: number | null;
  currentMa: number | null;
  presence: boolean;
  presenceSource: PresenceSource | null;
  safe: boolean;
  ai: boolean;
  distanceMm: number | null;
  distOk: boolean;
  tofOk: boolean | null;
  inaOk: boolean | null;
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
const PRESENCE_SOURCES: PresenceSource[] = ["pir", "tof", "pir+tof", "none"];

export function asMode(value: unknown): Mode {
  return MODE_VALUES.includes(value as Mode) ? (value as Mode) : "reading";
}

export function asPresenceSource(value: unknown): PresenceSource | null {
  return PRESENCE_SOURCES.includes(value as PresenceSource)
    ? (value as PresenceSource)
    : null;
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
  // The 2 s gateway telemetry carries presence and power; prefer it while it is fresh,
  // otherwise fall back to the 10 s state snapshot.
  const gatewayFresh =
    state.gatewayAt != null && now - state.gatewayAt <= STALE_TELEMETRY_MS;
  const liveGateway = gatewayFresh ? gateway : null;
  const presence = (liveGateway?.presence ?? snapshot?.presence) !== 0;
  const presenceSource = asPresenceSource(
    liveGateway?.presence_src ?? snapshot?.presence_src,
  );
  const rawDistance = liveGateway?.dist_mm ?? snapshot?.dist_mm;
  const distanceMm = rawDistance ? rawDistance : null;
  const distOkRaw = liveGateway?.dist_ok ?? snapshot?.dist_ok;
  const distOk = distOkRaw != null ? distOkRaw === 1 : distanceMm != null;
  const tofOkRaw = liveGateway?.tof_ok ?? snapshot?.tof_ok;
  const tofOk = tofOkRaw == null ? null : tofOkRaw === 1;
  const inaOkRaw = liveGateway?.ina_ok ?? snapshot?.ina_ok;
  const inaOk = inaOkRaw == null ? null : inaOkRaw === 1;
  const energyWhRaw = liveGateway?.energy_Wh ?? snapshot?.energy_Wh;
  const energyWh = typeof energyWhRaw === "number" ? energyWhRaw : null;
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

  const powerMw = liveGateway?.lamp_mW ?? snapshot?.lamp_mW ?? null;
  const voltage = liveGateway?.bus_V ?? snapshot?.bus_V ?? null;
  const currentMa = liveGateway?.current_mA ?? snapshot?.current_mA ?? null;

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
    energyWh,
    voltage,
    currentMa,
    presence,
    presenceSource,
    safe,
    ai: snapshot?.ai === 1,
    distanceMm,
    distOk,
    tofOk,
    inaOk,
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
