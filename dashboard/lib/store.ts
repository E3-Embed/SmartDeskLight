import {
  parseAlert,
  parseGatewayTelemetry,
  parseSensorHealth,
  parseSensorStatus,
  parseSensorTelemetry,
  parseSnapshot,
  parseStatus,
} from "./parse";
import {
  NODE_ID,
  TOPIC_ALERT,
  TOPIC_GATEWAY_STATE,
  TOPIC_GATEWAY_STATUS,
  TOPIC_GATEWAY_TELEMETRY,
  TOPIC_SENSOR_HEALTH,
  TOPIC_SENSOR_STATUS,
  TOPIC_SENSOR_TELEMETRY,
} from "./topics";
import type { Alert, PublicState, Sample, StreamEvent } from "./types";

const SAMPLE_LIMIT = 7200; // 2 h at 1 Hz
const ALERT_LIMIT = 40;

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
    statusAt: null,
    snapshot: null,
    snapshotAt: null,
    gateway: null,
    gatewayAt: null,
    sensors: {
      status: null,
      statusAt: null,
      telemetry: null,
      telemetryAt: null,
      health: null,
      healthAt: null,
    },
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
  const state = store().state;
  return {
    ...state,
    sensors: { ...state.sensors },
    serverTime: Date.now(),
  };
}

export function subscribe(listener: Listener): () => void {
  const internal = store();
  internal.listeners.add(listener);
  return () => internal.listeners.delete(listener);
}

function emit(sample: Sample | null) {
  const internal = store();
  internal.state.serverTime = Date.now();
  const event: StreamEvent = {
    state: { ...internal.state, sensors: { ...internal.state.sensors } },
    sample,
  };
  for (const listener of internal.listeners) {
    try {
      listener(event);
    } catch {
      // a broken SSE client must never stop the others
    }
  }
}

function pushSample(state: PublicState): Sample | null {
  const telemetry = state.sensors.telemetry;
  const snapshotBody = state.snapshot;
  const lux = telemetry?.lux ?? snapshotBody?.n1_lux;
  if (lux == null || !Number.isFinite(lux)) return null;

  const rawCct = telemetry?.cct ?? snapshotBody?.n1_cct;
  const cct = rawCct != null && rawCct > 0 ? rawCct : undefined;

  // Wall clock from the dashboard keeps the x-axis immune to node clock drift;
  // the gateway's own `ts` is kept in the raw payload for reference.
  const sample: Sample = {
    t: Date.now(),
    lux,
    cct,
    targetLux: snapshotBody?.target_lux ?? 500,
    targetCct: snapshotBody?.target_cct ?? 4000,
    pwm: snapshotBody?.pwm ?? 0,
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

/** Applies one MQTT message. Unknown topics are ignored on purpose. */
export function applyMessage(topic: string, payload: string): void {
  const state = store().state;

  switch (topic) {
    case TOPIC_GATEWAY_STATE: {
      const snapshotBody = parseSnapshot(payload);
      if (!snapshotBody) return;
      state.snapshot = snapshotBody;
      state.snapshotAt = Date.now();
      emit(pushSample(state));
      return;
    }

    case TOPIC_GATEWAY_TELEMETRY: {
      const gateway = parseGatewayTelemetry(payload);
      if (!gateway) return;
      state.gateway = gateway;
      state.gatewayAt = Date.now();
      if (state.status == null) state.status = "online";
      emit(null);
      return;
    }

    case TOPIC_GATEWAY_STATUS: {
      const status = parseStatus(payload);
      if (!status) return;
      state.status = status;
      state.statusAt = Date.now();
      emit(null);
      return;
    }

    case TOPIC_SENSOR_TELEMETRY: {
      const telemetry = parseSensorTelemetry(payload);
      if (!telemetry) return;
      if (telemetry.node_id && telemetry.node_id !== NODE_ID) return;
      state.sensors = { ...state.sensors, telemetry, telemetryAt: Date.now() };
      emit(pushSample(state));
      return;
    }

    case TOPIC_SENSOR_HEALTH: {
      const health = parseSensorHealth(payload);
      if (!health) return;
      if (health.node_id && health.node_id !== NODE_ID) return;
      state.sensors = { ...state.sensors, health, healthAt: Date.now() };
      emit(null);
      return;
    }

    case TOPIC_SENSOR_STATUS: {
      const status = parseSensorStatus(payload);
      if (!status) return;
      state.sensors = { ...state.sensors, status, statusAt: Date.now() };
      emit(null);
      return;
    }

    case TOPIC_ALERT: {
      const text = parseAlert(payload);
      if (!text) return;
      addAlert(text);
      emit(null);
      return;
    }

    default:
      return;
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
