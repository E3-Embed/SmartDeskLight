import {
  parseAlert,
  parseShadow,
  parseStatus,
  parseSys,
  parseTelemetry,
} from "./parse";
import type { Alert, PublicState, Sample, StreamEvent } from "./types";

const SAMPLE_LIMIT = 7200; // 2 h at 1 Hz
const ALERT_LIMIT = 40;

export const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? "@msg/sdl";
export const TOPIC_SHADOW = "@shadow/data/update";
export const TOPIC_SYS = `${TOPIC_PREFIX}/sys`;
export const TOPIC_STATUS = `${TOPIC_PREFIX}/status`;
export const TOPIC_ALERT = `${TOPIC_PREFIX}/alert`;
export const TOPIC_CMD = `${TOPIC_PREFIX}/cmd`;

export function telemetryTopic(nodeId = "N1"): string {
  return `${TOPIC_PREFIX}/${nodeId}/telemetry`;
}

type Listener = (event: StreamEvent) => void;

interface Internal {
  state: PublicState;
  samples: Sample[];
  listeners: Set<Listener>;
  alertSeq: number;
}

const globalRef = globalThis as unknown as { __sdlStore?: Internal };

function initialState(): PublicState {
  return {
    source: "mock",
    link: "connecting",
    linkError: null,
    status: null,
    shadow: null,
    shadowAt: null,
    sys: null,
    sysAt: null,
    telemetry: null,
    telemetryAt: null,
    alerts: [],
    mockScenario: null,
    serverTime: Date.now(),
  };
}

export function store(): Internal {
  if (!globalRef.__sdlStore) {
    globalRef.__sdlStore = {
      state: initialState(),
      samples: [],
      listeners: new Set(),
      alertSeq: 0,
    };
  }
  return globalRef.__sdlStore;
}

export function snapshot(): PublicState {
  return { ...store().state, serverTime: Date.now() };
}

export function subscribe(listener: Listener): () => void {
  const internal = store();
  internal.listeners.add(listener);
  return () => internal.listeners.delete(listener);
}

function emit(sample: Sample | null) {
  const internal = store();
  internal.state.serverTime = Date.now();
  const event: StreamEvent = { state: { ...internal.state }, sample };
  for (const listener of internal.listeners) {
    try {
      listener(event);
    } catch {
      // a broken SSE client must never stop the others
    }
  }
}

function pushSample(state: PublicState): Sample | null {
  const telemetry = state.telemetry;
  const shadow = state.shadow;
  const lux = telemetry?.lux ?? shadow?.n1_lux;
  if (lux == null || !Number.isFinite(lux)) return null;

  const existing = state.telemetry?.cct ?? shadow?.n1_cct ?? 0;
  const sample: Sample = {
    t: Date.now(),
    lux,
    cct: existing,
    targetLux: shadow?.target_lux ?? 500,
    targetCct: shadow?.target_cct ?? 4000,
    pwm: shadow?.pwm ?? 0,
  };

  const internal = store();
  const last = internal.samples[internal.samples.length - 1];
  if (last && sample.t - last.t < 900) {
    internal.samples[internal.samples.length - 1] = sample;
  } else {
    internal.samples.push(sample);
    if (internal.samples.length > SAMPLE_LIMIT) internal.samples.shift();
  }
  return sample;
}

function addAlert(text: string, at = Date.now()) {
  const internal = store();
  const recent = internal.state.alerts[0];
  if (recent && recent.text === text && at - recent.at < 20_000) return;
  const alert: Alert = { id: `a${++internal.alertSeq}`, text, at };
  internal.state.alerts = [alert, ...internal.state.alerts].slice(0, ALERT_LIMIT);
}

export function applyMessage(topic: string, payload: string): void {
  const internal = store();
  const state = internal.state;

  if (topic === TOPIC_SHADOW) {
    const shadow = parseShadow(payload);
    if (!shadow) return;
    state.shadow = shadow;
    state.shadowAt = Date.now();
    emit(pushSample(state));
    return;
  }

  if (topic === TOPIC_SYS) {
    const sys = parseSys(payload);
    if (!sys) return;
    state.sys = sys;
    state.sysAt = Date.now();
    if (state.status == null) state.status = "online";
    emit(null);
    return;
  }

  if (topic === TOPIC_STATUS) {
    const status = parseStatus(payload);
    if (!status) return;
    state.status = status;
    emit(null);
    return;
  }

  if (topic === TOPIC_ALERT) {
    const text = parseAlert(payload);
    if (!text) return;
    addAlert(text);
    emit(null);
    return;
  }

  if (topic.startsWith(`${TOPIC_PREFIX}/`) && topic.endsWith("/telemetry")) {
    const telemetry = parseTelemetry(payload);
    if (!telemetry) return;
    const nodeId = telemetry.node_id ?? topic.split("/").at(-2) ?? "N1";
    if (nodeId !== "N1") return;
    state.telemetry = telemetry;
    state.telemetryAt = Date.now();
    emit(pushSample(state));
  }
}

export function setLink(link: PublicState["link"], error: string | null = null) {
  const state = store().state;
  state.link = link;
  state.linkError = error;
  emit(null);
}

export function setSource(source: PublicState["source"]) {
  store().state.source = source;
}

export function setScenario(scenario: string | null) {
  store().state.mockScenario = scenario;
  emit(null);
}

export function raiseAlert(text: string) {
  addAlert(text);
  emit(null);
}

export function seedSamples(samples: Sample[]) {
  store().samples = samples.slice(-SAMPLE_LIMIT);
}

export function getSamples(sinceMs: number): Sample[] {
  return store().samples.filter((sample) => sample.t >= sinceMs);
}

export function sampleCount(): number {
  return store().samples.length;
}
