import {
  applyMessage,
  raiseAlert,
  seedSamples,
  setLink,
  setScenario,
  telemetryTopic,
  TOPIC_SHADOW,
  TOPIC_STATUS,
  TOPIC_SYS,
} from "./store";
import type { MockScenario, Mode, Sample } from "./types";

interface Sim {
  scenario: MockScenario;
  mode: Mode;
  targetLux: number;
  targetCct: number;
  lux: number;
  cct: number;
  pwm: number;
  presence: boolean;
  safe: boolean;
  filters: [boolean, boolean, boolean];
  uptime: number;
  rx: number;
  seq: number;
  buffered: number;
  dropped: number;
  powerMw: number;
  tick: number;
  dirty: boolean;
  lastSysAt: number;
  lastShadowAt: number;
  rng: () => number;
  alertsSent: Set<string>;
}

interface Global {
  __sdlMockSim?: Sim;
  __sdlMockTimer?: ReturnType<typeof setInterval>;
  __sdlMockSeeded?: boolean;
}

const globalRef = globalThis as unknown as Global;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ruleProfile(mode: Mode, hour: number) {
  let targetLux = 500;
  let targetCct = 4000;
  let filters: [boolean, boolean, boolean] = [true, false, false];
  if (mode === "coding") {
    targetLux = 300;
    targetCct = 4500;
    filters = [true, true, false];
  } else if (mode === "drawing") {
    targetLux = 700;
    targetCct = 5000;
    filters = [true, false, false];
  }
  if (hour >= 20 || hour < 6) {
    targetCct = 3000;
    filters = [filters[0], filters[1], true];
  }
  return { targetLux, targetCct, filters };
}

function newSim(): Sim {
  const hour = new Date().getHours();
  const profile = ruleProfile("reading", hour);
  return {
    scenario: "normal",
    mode: "reading",
    targetLux: profile.targetLux,
    targetCct: profile.targetCct,
    lux: profile.targetLux - 18,
    cct: profile.targetCct - 90,
    pwm: 168,
    presence: true,
    safe: false,
    filters: profile.filters,
    uptime: 4160,
    rx: 40218,
    seq: 40304,
    buffered: 0,
    dropped: 0,
    powerMw: 2700,
    tick: 0,
    dirty: true,
    lastSysAt: 0,
    lastShadowAt: 0,
    rng: mulberry32(20261116),
    alertsSent: new Set(),
  };
}

function noise(sim: Sim, amplitude: number): number {
  return (sim.rng() - 0.5) * 2 * amplitude;
}

function shadowPayload(sim: Sim) {
  return JSON.stringify({
    data: {
      n1_lux: Number((sim.lux + noise(sim, 1.5)).toFixed(1)),
      n1_cct: Math.round(sim.cct),
      n1_age_s: sim.scenario === "fault" ? Math.round(30 + sim.tick) : 0,
      n1_rx: sim.rx,
      n1_seq: sim.seq,
      dist_mm: sim.presence ? Math.round(530 + noise(sim, 35)) : 0,
      presence: sim.presence ? 1 : 0,
      lamp_mW: Math.round(sim.powerMw),
      bus_V: Number((5.02 + noise(sim, 0.03)).toFixed(2)),
      current_mA: Math.round(sim.powerMw / 5.02),
      diffuser: sim.filters[0] ? 1 : 0,
      nd: sim.filters[1] ? 1 : 0,
      warm: sim.filters[2] ? 1 : 0,
      pwm: Math.round(sim.pwm),
      safe: sim.safe ? 1 : 0,
      mode: sim.mode,
      target_lux: Math.round(sim.targetLux),
      target_cct: Math.round(sim.targetCct),
      ai: 1,
      buffered: sim.buffered,
      dropped: sim.dropped,
      heap: 168_400 - (sim.tick % 40) * 120,
      uptime_s: sim.uptime,
    },
  });
}

function sysPayload(sim: Sim, reset = "poweron") {
  return JSON.stringify({
    device: "sdl-gateway",
    uptime_s: sim.uptime,
    wifi_up: sim.scenario === "offline" ? 0 : 1,
    wifi_code: sim.scenario === "offline" ? 6 : 3,
    rssi: Math.round(-54 + noise(sim, 6)),
    wifi_ch: 6,
    ip: "192.168.1.42",
    wifi_retries: 1,
    mqtt_fails: sim.scenario === "offline" ? 4 : 0,
    ntp: 1,
    time: Math.floor(Date.now() / 1000),
    heap: 168_400 - (sim.tick % 40) * 120,
    heap_min: 132_880,
    temp_c: Number((48.2 + noise(sim, 1.1)).toFixed(1)),
    reset,
    nodes: 1,
    mode: sim.mode,
    safe: sim.safe ? 1 : 0,
    pwm: Math.round(sim.pwm),
    buffered: sim.buffered,
    dropped: sim.dropped,
  });
}

function telemetryPayload(sim: Sim) {
  return JSON.stringify({
    node_id: "N1",
    seq: sim.seq,
    ts: Math.floor(Date.now() / 1000),
    node_ms: sim.uptime,
    lux: Number(sim.lux.toFixed(1)),
    r: 40212,
    g: 39680,
    b: 36110,
    c: 13890,
    cct: Math.round(sim.cct),
  });
}

function once(sim: Sim, key: string, text: string) {
  if (sim.alertsSent.has(key)) return;
  sim.alertsSent.add(key);
  raiseAlert(text);
}

function publishShadow(sim: Sim) {
  applyMessage(TOPIC_SHADOW, shadowPayload(sim));
  sim.lastShadowAt = Date.now();
  sim.dirty = false;
}

function publishSys(sim: Sim, reset = "poweron") {
  applyMessage(TOPIC_SYS, sysPayload(sim, reset));
  sim.lastSysAt = Date.now();
}

function advance(sim: Sim) {
  sim.tick += 1;
  sim.uptime += 1;
  sim.seq += 1;
  if (sim.rng() > 0.002) sim.rx += 1;

  if (sim.scenario === "fault") {
    return;
  }

  if (sim.scenario === "away") {
    sim.presence = false;
    sim.pwm = Math.max(0, sim.pwm - 18);
    sim.lux = Math.max(0, sim.lux - 24);
    sim.powerMw = 260 + sim.pwm * 14.6;
    if (sim.pwm === 0) sim.lux = Math.max(0, sim.lux - 4);
    return;
  }

  sim.presence = true;

  if (sim.scenario === "safe") {
    sim.safe = true;
    sim.pwm = 128;
    sim.filters = [false, false, false];
    sim.lux += (520 - sim.lux) * 0.18;
    sim.cct += (3900 - sim.cct) * 0.1;
    sim.powerMw = 260 + sim.pwm * 14.6;
    return;
  }

  sim.safe = false;
  const error = sim.targetLux - sim.lux;
  sim.pwm += Math.max(-12, Math.min(12, error * 0.08));
  sim.pwm = Math.max(0, Math.min(255, sim.pwm));
  sim.lux += Math.max(-30, Math.min(30, error * 0.12)) + noise(sim, 2.2);
  sim.lux = Math.max(0, sim.lux);
  const cctError = sim.targetCct - sim.cct;
  sim.cct += Math.max(-70, Math.min(70, cctError * 0.12)) + noise(sim, 12);
  sim.powerMw = 260 + sim.pwm * 14.6;
}

function loop() {
  const sim = globalRef.__sdlMockSim;
  if (!sim) return;

  if (sim.scenario === "offline") return;

  advance(sim);

  if (sim.scenario !== "fault") {
    applyMessage(telemetryTopic("N1"), telemetryPayload(sim));
  }

  const now = Date.now();
  if (sim.dirty || now - sim.lastShadowAt >= 30_000) publishShadow(sim);
  if (now - sim.lastSysAt >= 10_000) publishSys(sim);

  if (sim.scenario === "fault") {
    once(
      sim,
      "fault",
      "ไม่มีข้อมูลจากโหนดเซนเซอร์ 1: ยึดความสว่างระดับปลอดภัย",
    );
  }
  if (sim.scenario === "safe") {
    once(sim, "safe", "Stop button pressed: lamp in safe state");
  }
}

function seedHistory(sim: Sim) {
  if (globalRef.__sdlMockSeeded) return;
  globalRef.__sdlMockSeeded = true;

  const now = Date.now();
  const samples: Sample[] = [];
  const rng = mulberry32(99173);
  for (let i = 720; i >= 1; i -= 1) {
    const t = now - i * 10_000;
    const ageMin = (now - t) / 60_000;
    const targetLux = ageMin > 38 ? 300 : 500;
    const targetCct = ageMin > 38 ? 4500 : 4000;
    const wave = Math.sin(i / 11) * 14 + Math.cos(i / 7) * 5;
    const lux = targetLux + wave + (rng() - 0.5) * 8;
    const pwm = Math.max(
      0,
      Math.min(255, Math.round(96 + (targetLux - 300) * 0.22 + Math.sin(i / 9) * 5)),
    );
    samples.push({
      t,
      lux: Number(lux.toFixed(1)),
      cct: Math.round(targetCct + Math.cos(i / 9) * 110 + (rng() - 0.5) * 40),
      targetLux,
      targetCct,
      pwm,
    });
  }
  seedSamples(samples);
}

export function startMock(): void {
  if (globalRef.__sdlMockTimer) return;

  const sim = globalRef.__sdlMockSim ?? newSim();
  globalRef.__sdlMockSim = sim;

  seedHistory(sim);
  setLink("online");
  applyMessage(TOPIC_STATUS, "online");
  publishShadow(sim);
  publishSys(sim);
  setScenario(sim.scenario);

  globalRef.__sdlMockTimer = setInterval(loop, 1000);
}

export function setMockScenario(next: MockScenario): void {
  const sim = globalRef.__sdlMockSim;
  if (!sim) return;

  const previous = sim.scenario;
  sim.scenario = next;
  setScenario(next);

  if (previous === "offline" && next !== "offline") {
    setLink("online");
    applyMessage(TOPIC_STATUS, "online");
    sim.buffered = 0;
    raiseAlert("เชื่อมต่อคลาวด์กลับมาแล้ว: ส่งข้อมูลที่ค้างอยู่ครบ");
  }
  if (next === "offline") {
    setLink("offline", "จำลอง: gateway ขาดการเชื่อมต่อ");
    applyMessage(TOPIC_STATUS, "offline");
  }
  if (next === "fault") {
    sim.alertsSent.delete("fault");
  }
  if (next === "safe") {
    sim.alertsSent.delete("safe");
    sim.safe = true;
    sim.presence = true;
    sim.pwm = 128;
    sim.filters = [false, false, false];
  }
  if (next === "away") {
    sim.presence = false;
    sim.safe = false;
  }
  if (next === "reboot") {
    sim.uptime = 0;
    sim.rx = 0;
    sim.seq = 0;
    sim.safe = false;
    sim.presence = true;
    sim.pwm = 0;
    const profile = ruleProfile(sim.mode, new Date().getHours());
    sim.targetLux = profile.targetLux;
    sim.targetCct = profile.targetCct;
    sim.filters = profile.filters;
    sim.alertsSent.clear();
    raiseAlert("Gateway รีสตาร์ท (panic) — uptime กลับเป็น 0");
    publishSys(sim, "panic");
    sim.scenario = "normal";
    setScenario("normal");
    sim.dirty = true;
    publishShadow(sim);
    return;
  }
  if (next === "normal") {
    const profile = ruleProfile(sim.mode, new Date().getHours());
    sim.safe = false;
    sim.presence = true;
    sim.targetLux = profile.targetLux;
    sim.targetCct = profile.targetCct;
    sim.filters = profile.filters;
    sim.alertsSent.clear();
    sim.lux = Math.max(40, sim.lux);
  }
  sim.dirty = true;
  publishShadow(sim);
  publishSys(sim);
}

export function mockScenario(): MockScenario {
  return globalRef.__sdlMockSim?.scenario ?? "normal";
}

export function mockCommand(command: { mode?: Mode; feedback?: "too_bright" | "too_dim" }): boolean {
  const sim = globalRef.__sdlMockSim;
  if (!sim) return false;

  if (command.mode) {
    const profile = ruleProfile(command.mode, new Date().getHours());
    sim.mode = command.mode;
    sim.targetLux = profile.targetLux;
    sim.targetCct = profile.targetCct;
    sim.filters = profile.filters;
  }

  if (command.feedback) {
    const factor = command.feedback === "too_bright" ? 0.85 : 1.15;
    sim.targetLux = Math.round(
      Math.max(200, Math.min(750, sim.targetLux * factor)),
    );
  }

  sim.dirty = true;
  publishShadow(sim);
  publishSys(sim);
  return true;
}
