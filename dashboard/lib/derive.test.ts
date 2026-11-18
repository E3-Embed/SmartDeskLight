import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import type { PublicState, SensorState } from "./types";

const NOW = 1_700_000_000_000;

function sensors(overrides: Partial<SensorState> = {}): SensorState {
  return {
    status: { ts: Math.floor(NOW / 1000), N1: "online" },
    statusAt: NOW - 2000,
    telemetry: { node_id: "N1", seq: 10, lux: 500, cct: 4000 },
    telemetryAt: NOW - 1000,
    health: { node_id: "N1", tx_acked: 990, tx_attempts: 1000 },
    healthAt: NOW - 1000,
    ...overrides,
  };
}

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    source: "mock",
    link: "online",
    linkError: null,
    status: "online",
    statusAt: NOW - 1000,
    snapshot: {
      n1_lux: 500,
      n1_cct: 4000,
      n1_age_s: 0,
      n1_rx: 99,
      n1_seq: 100,
      presence: 1,
      dist_mm: 520,
      lamp_mW: 2600,
      pwm: 160,
      safe: 0,
      mode: "reading",
      target_lux: 500,
      target_cct: 4000,
      diffuser: 1,
      nd: 0,
      warm: 0,
      ai: 1,
      buffered: 0,
      dropped: 0,
      uptime_s: 120,
    },
    snapshotAt: NOW - 1000,
    gateway: {
      uptime_s: 120,
      heap: 168000,
      heap_min: 132000,
      rssi: -54,
      reset: "poweron",
      mode: "reading",
      safe: 0,
    },
    gatewayAt: NOW - 1000,
    sensors: sensors(),
    alerts: [],
    mockScenario: "normal",
    serverTime: NOW,
    ...overrides,
  };
}

describe("derive", () => {
  it("is steady inside the ±7% band", () => {
    const state = makeState({
      sensors: sensors({ telemetry: { node_id: "N1", lux: 520, cct: 4000 } }),
    });
    expect(derive(state, NOW).state).toBe("steady");
    expect(derive(state, NOW).inTolerance).toBe(true);
  });

  it("is adjusting outside the band", () => {
    const state = makeState({
      sensors: sensors({ telemetry: { node_id: "N1", lux: 400, cct: 4000 } }),
    });
    const derived = derive(state, NOW);
    expect(derived.state).toBe("adjusting");
    expect(derived.errorPct).toBeCloseTo(-20, 1);
  });

  it("reports away when presence is zero", () => {
    const state = makeState({ snapshot: { ...makeState().snapshot, presence: 0 } });
    expect(derive(state, NOW).state).toBe("away");
  });

  it("reports emergency before other states when safe is set", () => {
    const state = makeState({
      snapshot: { ...makeState().snapshot, safe: 1, presence: 0 },
    });
    expect(derive(state, NOW).state).toBe("emergency");
  });

  it("reports sensor fault when the node has been silent", () => {
    const state = makeState({
      snapshot: { ...makeState().snapshot, n1_age_s: 14 },
    });
    expect(derive(state, NOW).state).toBe("fault");
  });

  it("reports sensor fault when the presence map says the node is offline", () => {
    const state = makeState({
      sensors: sensors({
        status: { ts: Math.floor(NOW / 1000), N1: "offline" },
        statusAt: NOW - 2000,
      }),
    });
    expect(derive(state, NOW).state).toBe("fault");
    expect(derive(state, NOW).nodeOnline).toBe(false);
  });

  it("ignores a stale presence map", () => {
    const state = makeState({
      sensors: sensors({
        status: { ts: 0, N1: "offline" },
        statusAt: NOW - 120_000,
      }),
    });
    expect(derive(state, NOW).state).toBe("steady");
  });

  it("reports stale when the snapshot and telemetry are both old", () => {
    const state = makeState({
      snapshotAt: NOW - 60_000,
      sensors: sensors({ telemetryAt: NOW - 30_000 }),
    });
    expect(derive(state, NOW).state).toBe("stale");
  });

  it("reports offline when the link drops or the Last Will says offline", () => {
    expect(derive(makeState({ link: "offline" }), NOW).state).toBe("offline");
    expect(derive(makeState({ status: "offline" }), NOW).state).toBe("offline");
  });

  it("computes the ESP-NOW success rate from node health", () => {
    const derived = derive(makeState(), NOW);
    expect(derived.successRate).toBeCloseTo(99, 0);
    expect(derived.filters).toEqual([true, false, false]);
    expect(derived.heap).toBe(168000);
    expect(derived.heapMin).toBe(132000);
    expect(derived.rssi).toBe(-54);
  });

  it("treats cct = 0 as no reading", () => {
    const state = makeState({
      snapshot: { ...makeState().snapshot, n1_cct: 0 },
      sensors: sensors({ telemetry: { node_id: "N1", lux: 500 } }),
    });
    expect(derive(state, NOW).cct).toBeNull();
  });

  it("waits until the first snapshot arrives", () => {
    const state = makeState({ snapshot: null, snapshotAt: null });
    expect(derive(state, NOW).state).toBe("waiting");
  });
});
