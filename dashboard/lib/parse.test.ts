import { describe, expect, it } from "vitest";
import {
  parseAlert,
  parseGatewayTelemetry,
  parseSensorHealth,
  parseSensorStatus,
  parseSensorTelemetry,
  parseSnapshot,
  parseStatus,
} from "./parse";

describe("parseSnapshot", () => {
  it("reads the flat gw/state payload", () => {
    const payload = JSON.stringify({
      device: "sdl-gateway",
      n1_lux: 15.83,
      n1_cct: 5675,
      presence: 1,
      target_lux: 500,
      pwm: 255,
    });
    expect(parseSnapshot(payload)).toMatchObject({
      device: "sdl-gateway",
      n1_lux: 15.83,
      n1_cct: 5675,
      presence: 1,
    });
  });

  it("still accepts the legacy { data: … } wrapper", () => {
    expect(parseSnapshot(JSON.stringify({ data: { n1_lux: 42 } }))).toEqual({ n1_lux: 42 });
  });

  it("rejects non-JSON and empty objects", () => {
    expect(parseSnapshot("online")).toBeNull();
    expect(parseSnapshot("{}")).toBeNull();
  });
});

describe("parseGatewayTelemetry", () => {
  it("keeps numbers and strings but drops booleans", () => {
    const payload = JSON.stringify({
      device: "sdl-gateway",
      uptime_s: 1231,
      rssi: -47,
      ip: "192.168.1.191",
      ntp: true,
    });
    expect(parseGatewayTelemetry(payload)).toEqual({
      device: "sdl-gateway",
      uptime_s: 1231,
      rssi: -47,
      ip: "192.168.1.191",
    });
  });
});

describe("parseSensorTelemetry", () => {
  it("keeps lux, RGB channels and a valid CCT", () => {
    const payload = JSON.stringify({
      node_id: "N1",
      seq: 1849,
      ts: 1794992723,
      lux: 15.83333,
      r: 237,
      g: 289,
      b: 264,
      c: 749,
      cct: 5675,
    });
    expect(parseSensorTelemetry(payload)).toMatchObject({
      node_id: "N1",
      lux: 15.83333,
      r: 237,
      g: 289,
      b: 264,
      c: 749,
      cct: 5675,
    });
  });

  it("drops cct = 0 because the reading is not trustworthy", () => {
    const parsed = parseSensorTelemetry(
      JSON.stringify({ node_id: "N1", lux: 1.2, r: 10, g: 12, b: 9, c: 30, cct: 0 }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("cct");
    expect(parsed?.c).toBe(30);
  });
});

describe("parseSensorHealth", () => {
  it("reads the heartbeat fields", () => {
    const payload = JSON.stringify({
      node_id: "N1",
      seq: 1850,
      reset: "poweron",
      temp_c: 43.7,
      tx_acked: 1846,
      tx_attempts: 1858,
    });
    expect(parseSensorHealth(payload)).toMatchObject({
      node_id: "N1",
      reset: "poweron",
      tx_acked: 1846,
      tx_attempts: 1858,
    });
  });
});

describe("parseSensorStatus", () => {
  it("reads the retained presence map", () => {
    expect(parseSensorStatus(JSON.stringify({ ts: 1794992731, N1: "online" }))).toEqual({
      ts: 1794992731,
      N1: "online",
    });
  });
});

describe("parseStatus", () => {
  it("accepts the quoted retained payload", () => {
    expect(parseStatus('"online"')).toBe("online");
    expect(parseStatus("offline")).toBe("offline");
    expect(parseStatus("maybe")).toBeNull();
  });
});

describe("parseAlert", () => {
  it("keeps plain text and prefers JSON text fields", () => {
    expect(parseAlert("Stop button pressed: lamp in safe state")).toBe(
      "Stop button pressed: lamp in safe state",
    );
    expect(parseAlert(JSON.stringify({ text: "โหนดขาดการเชื่อมต่อ" }))).toBe(
      "โหนดขาดการเชื่อมต่อ",
    );
    expect(parseAlert("   ")).toBeNull();
  });
});
