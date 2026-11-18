import { beforeEach, describe, expect, it } from "vitest";
import { applyMessage, getSamples, snapshot as readState } from "./store";
import {
  TOPIC_GATEWAY_STATE,
  TOPIC_GATEWAY_TELEMETRY,
  TOPIC_SENSOR_HEALTH,
  TOPIC_SENSOR_STATUS,
  TOPIC_SENSOR_TELEMETRY,
} from "./topics";

// Payloads captured from the live broker on 2026-11-18.
const GW_STATE = JSON.stringify({
  device: "sdl-gateway",
  n1_lux: 30,
  n1_cct: 5952,
  n1_age_s: 0,
  n1_rx: 3721,
  n1_seq: 2308,
  n1_up_s: 1541,
  n1_heap: 280324,
  n1_temp_c: 43.7,
  n1_sys_age_s: 3,
  dist_mm: 0,
  presence: 0,
  lamp_mW: 0,
  bus_V: 0,
  current_mA: 0,
  diffuser: 1,
  nd: 0,
  warm: 0,
  pwm: 255,
  safe: 0,
  mode: "reading",
  target_lux: 500,
  target_cct: 4000,
  ai: 0,
  buffered: 0,
  dropped: 0,
  heap: 182296,
  uptime_s: 1541,
});

const GW_TELEMETRY = JSON.stringify({
  device: "sdl-gateway",
  uptime_s: 2428,
  wifi_up: 1,
  wifi_code: 3,
  rssi: -45,
  wifi_ch: 1,
  ip: "192.168.1.191",
  wifi_retries: 0,
  mqtt_fails: 0,
  ntp: 1,
  time: 1794997779,
  heap: 182808,
  heap_min: 163056,
  temp_c: 49.6,
  reset: "task_wdt",
  nodes: 1,
  mode: "reading",
  safe: 0,
  pwm: 255,
  buffered: 0,
  dropped: 0,
});

const SENSOR_TELEMETRY = JSON.stringify({
  node_id: "N1",
  seq: 2296,
  ts: 1794999074,
  node_ms: 1533522,
  lux: 4.166667,
  r: 71,
  g: 106,
  b: 85,
  c: 269,
  cct: 5952,
});

const SENSOR_HEALTH = JSON.stringify({
  node_id: "N1",
  seq: 2297,
  ts: 1794999074,
  node_ms: 1533553,
  uptime_s: 1533,
  heap: 280324,
  heap_min: 279588,
  wifi_ch: 1,
  reset: "poweron",
  temp_c: 43.7,
  tx_acked: 3721,
  tx_attempts: 2308,
});

const SENSOR_STATUS = JSON.stringify({ ts: 1794999050, N1: "online", N2: "offline" });

beforeEach(() => {
  // drop the module-level store between tests
  (globalThis as unknown as { __sdlStore?: unknown }).__sdlStore = undefined;
});

describe("store.applyMessage", () => {
  it("fills snapshot, gateway, sensor telemetry, health and presence", () => {
    applyMessage(TOPIC_GATEWAY_STATE, GW_STATE);
    applyMessage(TOPIC_GATEWAY_TELEMETRY, GW_TELEMETRY);
    applyMessage(TOPIC_SENSOR_TELEMETRY, SENSOR_TELEMETRY);
    applyMessage(TOPIC_SENSOR_HEALTH, SENSOR_HEALTH);
    applyMessage(TOPIC_SENSOR_STATUS, SENSOR_STATUS);

    const state = readState();

    expect(state.snapshot).toMatchObject({ n1_lux: 30, target_lux: 500, pwm: 255 });
    expect(state.gateway).toMatchObject({ rssi: -45, reset: "task_wdt" });
    expect(state.sensors.telemetry).toMatchObject({ lux: 4.166667, r: 71, c: 269 });
    expect(state.sensors.health).toMatchObject({ tx_acked: 3721, tx_attempts: 2308 });
    expect(state.sensors.status).toMatchObject({ N1: "online", N2: "offline" });
    expect(state.status).toBe("online"); // implied by the first gateway telemetry
  });

  it("turns each telemetry message into a chart sample", () => {
    applyMessage(TOPIC_SENSOR_TELEMETRY, SENSOR_TELEMETRY);
    const samples = getSamples(0);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ lux: 4.166667, cct: 5952 });
  });

  it("ignores telemetry from another node", () => {
    applyMessage(
      TOPIC_SENSOR_TELEMETRY,
      JSON.stringify({ node_id: "N2", lux: 999, cct: 3000 }),
    );
    expect(readState().sensors.telemetry).toBeNull();
    expect(getSamples(0)).toHaveLength(0);
  });

  it("ignores unknown topics such as the old retained status", () => {
    applyMessage("@msg/sdl/status", "offline");
    applyMessage("@msg/sdl/gateway/status", "offline");
    expect(readState().status).toBeNull();
  });
});
