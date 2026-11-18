import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import type { PublicState } from "./types";

const NOW = 1_700_000_000_000;

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    source: "mock",
    link: "online",
    linkError: null,
    status: "online",
    shadow: {
      n1_lux: 500,
      n1_cct: 4000,
      n1_age_s: 0,
      n1_rx: 99,
      n1_seq: 100,
      presence: 1,
      distanceMm: 520,
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
    shadowAt: NOW - 1000,
    sys: { uptime_s: 120, heap: 168000, rssi: -54, reset: "poweron" },
    sysAt: NOW - 1000,
    telemetry: { node_id: "N1", seq: 10, lux: 500, cct: 4000 },
    telemetryAt: NOW - 1000,
    alerts: [],
    mockScenario: "normal",
    serverTime: NOW,
    ...overrides,
  };
}

describe("derive", () => {
  it("is steady inside the ±7% band", () => {
    const state = makeState({ telemetry: { lux: 520, cct: 4000 } });
    expect(derive(state, NOW).state).toBe("steady");
    expect(derive(state, NOW).inTolerance).toBe(true);
  });

  it("is adjusting outside the band", () => {
    const state = makeState({ telemetry: { lux: 400, cct: 4000 } });
    const derived = derive(state, NOW);
    expect(derived.state).toBe("adjusting");
    expect(derived.errorPct).toBeCloseTo(-20, 1);
  });

  it("reports away when presence is zero", () => {
    const state = makeState({
      shadow: { ...makeState().shadow, presence: 0 },
    });
    expect(derive(state, NOW).state).toBe("away");
  });

  it("reports emergency before other states when safe is set", () => {
    const state = makeState({
      shadow: { ...makeState().shadow, safe: 1, presence: 0 },
    });
    expect(derive(state, NOW).state).toBe("emergency");
  });

  it("reports sensor fault when the node has been silent", () => {
    const state = makeState({
      shadow: { ...makeState().shadow, n1_age_s: 14 },
    });
    expect(derive(state, NOW).state).toBe("fault");
  });

  it("reports stale when both shadow and telemetry are old", () => {
    const state = makeState({
      shadowAt: NOW - 60_000,
      telemetryAt: NOW - 30_000,
    });
    expect(derive(state, NOW).state).toBe("stale");
  });

  it("reports offline when the link drops", () => {
    expect(derive(makeState({ link: "offline" }), NOW).state).toBe("offline");
    expect(derive(makeState({ status: "offline" }), NOW).state).toBe("offline");
  });

  it("computes the ESP-NOW success rate and filter flags", () => {
    const derived = derive(makeState(), NOW);
    expect(derived.successRate).toBeCloseTo(99, 0);
    expect(derived.filters).toEqual([true, false, false]);
  });

  it("waits until the first shadow arrives", () => {
    const state = makeState({ shadow: null, shadowAt: null });
    expect(derive(state, NOW).state).toBe("waiting");
  });
});
