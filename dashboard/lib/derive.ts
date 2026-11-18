import { clamp } from "./format";
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
export const STALE_SHADOW_MS = 45_000;
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
  buffered: number;
  dropped: number;
  uptimeS: number | null;
  heap: number | null;
  rssi: number | null;
  reset: string | null;
  filters: [boolean, boolean, boolean];
  lastSeenAt: number | null;
}

const MODE_VALUES: Mode[] = ["reading", "coding", "drawing"];

export function asMode(value: unknown): Mode {
  return MODE_VALUES.includes(value as Mode) ? (value as Mode) : "reading";
}

export function derive(state: PublicState, now = Date.now()): Derived {
  const shadow = state.shadow;
  const sys = state.sys;
  const telemetry = state.telemetry;

  const lux = telemetry?.lux ?? shadow?.n1_lux ?? null;
  const cct = telemetry?.cct ?? shadow?.n1_cct ?? null;
  const targetLux = shadow?.target_lux ?? 500;
  const targetCct = shadow?.target_cct ?? 4000;
  const pwm = clamp(shadow?.pwm ?? 0, 0, 255);
  const presence = shadow?.presence !== 0;
  const safe = shadow?.safe === 1 || sys?.safe === 1;

  const shadowAge = state.shadowAt == null ? Infinity : now - state.shadowAt;
  const telemetryAge = state.telemetryAt == null ? Infinity : now - state.telemetryAt;
  const nodeAge = shadow?.n1_age_s ?? 0;

  const errorPct =
    lux != null && targetLux > 0 ? ((lux - targetLux) / targetLux) * 100 : null;
  const inTolerance = errorPct != null && Math.abs(errorPct) <= TOLERANCE_PCT;

  let lampState: LampState;
  if (state.link === "offline" || state.link === "error" || state.status === "offline") {
    lampState = "offline";
  } else if (!shadow) {
    lampState = "waiting";
  } else if (shadowAge > STALE_SHADOW_MS && telemetryAge > STALE_TELEMETRY_MS) {
    lampState = "stale";
  } else if (safe) {
    lampState = "emergency";
  } else if (nodeAge > NODE_FAULT_AGE_S || telemetryAge > STALE_TELEMETRY_MS) {
    lampState = "fault";
  } else if (!presence) {
    lampState = "away";
  } else if (inTolerance) {
    lampState = "steady";
  } else {
    lampState = "adjusting";
  }

  const seq = shadow?.n1_seq ?? 0;
  const received = shadow?.n1_rx ?? 0;
  const successRate = seq > 0 ? clamp((received / seq) * 100, 0, 100) : null;

  const powerMw = shadow?.lamp_mW ?? null;

  return {
    state: lampState,
    meta: STATE_META[lampState],
    mode: asMode(shadow?.mode ?? sys?.mode),
    lux,
    cct,
    targetLux,
    targetCct,
    pwm,
    pwmPct: (pwm / 255) * 100,
    powerMw,
    powerW: powerMw == null ? null : powerMw / 1000,
    voltage: shadow?.bus_V ?? null,
    currentMa: shadow?.current_mA ?? null,
    presence,
    safe,
    ai: shadow?.ai === 1,
    distanceMm: shadow?.dist_mm ? shadow.dist_mm : null,
    errorPct,
    inTolerance,
    successRate,
    buffered: shadow?.buffered ?? sys?.buffered ?? 0,
    dropped: shadow?.dropped ?? sys?.dropped ?? 0,
    uptimeS: sys?.uptime_s ?? shadow?.uptime_s ?? null,
    heap: sys?.heap ?? shadow?.heap ?? null,
    rssi: sys?.rssi ?? null,
    reset: typeof sys?.reset === "string" ? sys.reset : null,
    filters: [
      shadow?.diffuser === 1,
      shadow?.nd === 1,
      shadow?.warm === 1,
    ],
    lastSeenAt:
      state.shadowAt == null && state.telemetryAt == null
        ? null
        : Math.max(state.shadowAt ?? 0, state.telemetryAt ?? 0),
  };
}
