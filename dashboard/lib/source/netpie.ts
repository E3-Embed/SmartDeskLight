import mqtt, { type MqttClient } from "mqtt";
import {
  applyMessage,
  setLink,
  TOPIC_PREFIX,
  TOPIC_SHADOW,
} from "../store";

const MQTT_URL = process.env.NETPIE_MQTT_URL ?? "mqtts://mqtt.netpie.io:8883";
const API_URL = process.env.NETPIE_API_URL ?? "https://api.netpie.io/v2/device";
const CLIENT_ID = process.env.NETPIE_CLIENT_ID ?? "";
const TOKEN = process.env.NETPIE_TOKEN ?? "";
const SECRET = process.env.NETPIE_SECRET ?? "";
const SHADOW_ALIAS = process.env.NETPIE_DEVICE_ALIAS ?? "gateway";
const CMD_TOPIC = process.env.NETPIE_CMD_TOPIC ?? "sdl/cmd";

interface NetpieGlobal {
  __sdlNetpieStarted?: boolean;
  __sdlNetpieClient?: MqttClient;
  __sdlNetpiePoll?: ReturnType<typeof setInterval>;
}

const globalRef = globalThis as unknown as NetpieGlobal;

function authHeader(): string {
  return `Device ${CLIENT_ID}:${TOKEN}`;
}

async function pullShadow(): Promise<void> {
  if (!CLIENT_ID || !TOKEN) return;
  try {
    const response = await fetch(
      `${API_URL}/shadow/data?alias=${encodeURIComponent(SHADOW_ALIAS)}`,
      { headers: { Authorization: authHeader() }, cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error(`shadow HTTP ${response.status}`);
    const json = (await response.json()) as { data?: Record<string, unknown> };
    const data = json?.data ?? {};
    if (Object.keys(data).length > 0) {
      applyMessage(TOPIC_SHADOW, JSON.stringify({ data }));
    }
  } catch (error) {
    setLink("error", error instanceof Error ? error.message : String(error));
  }
}

export function startNetpie(): void {
  if (globalRef.__sdlNetpieStarted) return;
  globalRef.__sdlNetpieStarted = true;

  if (!CLIENT_ID || !TOKEN) {
    setLink("error", "ยังไม่ได้ตั้ง NETPIE_CLIENT_ID / NETPIE_TOKEN ใน .env.local");
    return;
  }

  setLink("connecting");

  const client = mqtt.connect(MQTT_URL, {
    clientId: CLIENT_ID,
    username: TOKEN,
    password: SECRET || undefined,
    keepalive: 30,
    clean: true,
    reconnectPeriod: 4000,
    connectTimeout: 12000,
    rejectUnauthorized: true,
  });
  globalRef.__sdlNetpieClient = client;

  client.on("connect", () => {
    setLink("online");
    client.subscribe(
      ["@shadow/data/updated", `${TOPIC_PREFIX}/#`, "@private/#"],
      { qos: 1 },
      (error) => {
        if (error) setLink("error", `subscribe ไม่สำเร็จ: ${error.message}`);
      },
    );
    void pullShadow();
  });

  client.on("message", (topic, payload) => {
    const text = payload.toString();
    if (topic === "@shadow/data/updated") {
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const wrapped = body && typeof body.data === "object" ? body : { data: body };
        applyMessage(TOPIC_SHADOW, JSON.stringify(wrapped));
      } catch {
        // ignore malformed shadow payloads
      }
      return;
    }
    applyMessage(topic, text);
  });

  client.on("reconnect", () => setLink("connecting"));
  client.on("close", () => setLink("offline", "การเชื่อมต่อ NETPIE ขาด"));
  client.on("error", (error) => setLink("error", error.message));

  const poll = setInterval(() => void pullShadow(), 15_000);
  poll.unref?.();
  globalRef.__sdlNetpiePoll = poll;

  void pullShadow();
}

export async function netpiePublish(
  payload: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!CLIENT_ID || !TOKEN) return { ok: false, error: "ยังไม่ได้ตั้ง credential ของ NETPIE" };
  try {
    const response = await fetch(
      `${API_URL}/message?topic=${encodeURIComponent(CMD_TOPIC)}`,
      {
        method: "PUT",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "text/plain",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      return { ok: false, error: `NETPIE ตอบ ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "ส่งคำสั่งไม่สำเร็จ",
    };
  }
}
