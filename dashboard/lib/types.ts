export type Mode = "reading" | "coding" | "drawing";

export type LinkState = "connecting" | "online" | "offline" | "error";

export type SourceKind = "mock" | "mqtt";

/**
 * One row of the timeseries the charts draw. `t` is epoch milliseconds.
 *
 * Only `lux` is guaranteed: rows read back from Postgres carry `lux`/`cct`
 * but no targets or PWM, so those stay optional and the charts hide the
 * corresponding lines when they are missing.
 */
export interface Sample {
  t: number;
  lux: number;
  cct?: number;
  targetLux?: number;
  targetCct?: number;
  pwm?: number;
}

/** `@msg/sdl/gw/state` — flat snapshot of the lamp plus every node's last value. */
export interface GatewaySnapshot {
  device?: string;
  n1_lux?: number;
  n1_cct?: number;
  n1_age_s?: number;
  n1_rx?: number;
  n1_seq?: number;
  n1_up_s?: number;
  n1_heap?: number;
  n1_temp_c?: number;
  n1_sys_age_s?: number;
  dist_mm?: number;
  dist_ok?: number;
  tof_ok?: number;
  presence?: number;
  presence_src?: string;
  lamp_mW?: number;
  bus_V?: number;
  current_mA?: number;
  ina_ok?: number;
  energy_Wh?: number;
  energy_reading_Wh?: number;
  energy_coding_Wh?: number;
  energy_drawing_Wh?: number;
  power_reading_mW?: number;
  power_coding_mW?: number;
  power_drawing_mW?: number;
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

/** `@msg/sdl/gw/telemetry` — gateway health, published every 2 s. */
export interface GatewayTelemetry {
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
  dist_mm?: number;
  dist_ok?: number;
  tof_ok?: number;
  presence?: number;
  presence_src?: string;
  lamp_mW?: number;
  bus_V?: number;
  current_mA?: number;
  ina_ok?: number;
  energy_Wh?: number;
  buffered?: number;
  dropped?: number;
  [key: string]: number | string | undefined;
}

/** `@msg/sdl/sensor/telemetry` — BH1750 lux plus TCS34725 raw channels. */
export interface SensorTelemetry {
  node_id?: string;
  seq?: number;
  ts?: number;
  node_ms?: number;
  lux?: number;
  r?: number;
  g?: number;
  b?: number;
  c?: number;
  cct?: number;
  [key: string]: number | string | undefined;
}

/** `@msg/sdl/sensor/health` — node heartbeat, published every 2 s. */
export interface SensorHealth {
  node_id?: string;
  seq?: number;
  ts?: number;
  node_ms?: number;
  uptime_s?: number;
  heap?: number;
  heap_min?: number;
  wifi_ch?: number;
  reset?: string;
  temp_c?: number;
  tx_acked?: number;
  tx_attempts?: number;
  [key: string]: number | string | undefined;
}

/** `@msg/sdl/sensor/status` — retained presence map written by the gateway. */
export interface SensorStatus {
  ts?: number;
  [node: string]: number | string | undefined;
}

export interface SensorState {
  status: SensorStatus | null;
  statusAt: number | null;
  telemetry: SensorTelemetry | null;
  telemetryAt: number | null;
  health: SensorHealth | null;
  healthAt: number | null;
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
  /** Gateway Last Will value from `gw/status`. */
  status: "online" | "offline" | null;
  statusAt: number | null;
  snapshot: GatewaySnapshot | null;
  snapshotAt: number | null;
  gateway: GatewayTelemetry | null;
  gatewayAt: number | null;
  sensors: SensorState;
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
