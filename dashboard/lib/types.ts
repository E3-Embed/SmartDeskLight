export type Mode = "reading" | "coding" | "drawing";

export type LinkState = "connecting" | "online" | "offline" | "error";

export type SourceKind = "mock" | "mqtt" | "netpie";

/** One row of the timeseries the charts draw. `t` is epoch milliseconds. */
export interface Sample {
  t: number;
  lux: number;
  cct: number;
  targetLux: number;
  targetCct: number;
  pwm: number;
}

export interface Shadow {
  n1_lux?: number;
  n1_cct?: number;
  n1_age_s?: number;
  n1_rx?: number;
  n1_seq?: number;
  dist_mm?: number;
  presence?: number;
  lamp_mW?: number;
  bus_V?: number;
  current_mA?: number;
  diffuser?: number;
  nd?: number;
  warm?: number;
  pwm?: number;
  safe?: number;
  mode?: string;
  target_lux?: number;
  target_cct?: number;
  ai?: number;
  buffered?: number;
  dropped?: number;
  heap?: number;
  uptime_s?: number;
  [key: string]: number | string | undefined;
}

export interface Sys {
  device?: string;
  uptime_s?: number;
  wifi_up?: number;
  wifi_code?: number;
  rssi?: number;
  wifi_ch?: number;
  ip?: string;
  wifi_retries?: number;
  mqtt_fails?: number;
  ntp?: number;
  time?: number;
  heap?: number;
  heap_min?: number;
  temp_c?: number;
  reset?: string;
  nodes?: number;
  mode?: string;
  safe?: number;
  pwm?: number;
  buffered?: number;
  dropped?: number;
  [key: string]: number | string | undefined;
}

export interface Telemetry {
  node_id?: string;
  seq?: number;
  ts?: number;
  node_ms?: number;
  lux?: number;
  cct?: number;
  r?: number;
  g?: number;
  b?: number;
  c?: number;
  [key: string]: number | string | undefined;
}

export interface Alert {
  id: string;
  text: string;
  at: number;
}

/** Everything the browser needs to paint the dashboard. */
export interface PublicState {
  source: SourceKind;
  link: LinkState;
  linkError: string | null;
  status: "online" | "offline" | null;
  shadow: Shadow | null;
  shadowAt: number | null;
  sys: Sys | null;
  sysAt: number | null;
  telemetry: Telemetry | null;
  telemetryAt: number | null;
  alerts: Alert[];
  mockScenario: string | null;
  serverTime: number;
}

export interface StreamEvent {
  state: PublicState;
  sample: Sample | null;
}

export type MockScenario =
  | "normal"
  | "away"
  | "fault"
  | "offline"
  | "safe"
  | "reboot";

export const MOCK_SCENARIOS: { id: MockScenario; labelTh: string; labelEn: string }[] = [
  { id: "normal", labelTh: "ปกติ", labelEn: "Normal" },
  { id: "away", labelTh: "ไม่มีคน", labelEn: "Away" },
  { id: "fault", labelTh: "เซนเซอร์หลุด", labelEn: "Fault" },
  { id: "offline", labelTh: "ออฟไลน์", labelEn: "Offline" },
  { id: "safe", labelTh: "หยุดฉุกเฉิน", labelEn: "Safe" },
  { id: "reboot", labelTh: "รีบูต", labelEn: "Reboot" },
];
