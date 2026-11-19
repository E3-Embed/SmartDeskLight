import mqtt, { type MqttClient } from "mqtt";
import { applyMessage, setLink } from "../store";
import { TOPIC_CMD, TOPIC_WILDCARD } from "../topics";

interface MqttGlobal {
  __sdlMqttClient?: MqttClient;
  __sdlMqttStarted?: boolean;
}

const globalRef = globalThis as unknown as MqttGlobal;

export function startMqtt(): void {
  if (globalRef.__sdlMqttStarted) return;
  globalRef.__sdlMqttStarted = true;

  const url = process.env.MQTT_URL ?? "mqtts://85.211.247.199.nip.io:8883";
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const clientId = process.env.MQTT_CLIENT_ID ?? "sdl-dashboard";

  if (!username) {
    setLink("error", "ยังไม่ได้ตั้ง MQTT_USERNAME ใน .env.local — ใช้ mock ไปก่อน");
    return;
  }

  setLink("connecting");

  const client = mqtt.connect(url, {
    clientId,
    username,
    password,
    keepalive: 30,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    // The broker uses a Let's Encrypt certificate for a nip.io host; set
    // MQTT_TLS_INSECURE=1 only for a self-signed deployment.
    rejectUnauthorized: process.env.MQTT_TLS_INSECURE !== "1",
  });
  globalRef.__sdlMqttClient = client;

  client.on("connect", () => {
    setLink("online");
    client.subscribe(TOPIC_WILDCARD, { qos: 1 }, (error) => {
      if (error) setLink("error", `subscribe ไม่สำเร็จ: ${error.message}`);
    });
  });

  client.on("message", (topic, payload) => {
    applyMessage(topic, payload.toString());
  });

  client.on("reconnect", () => setLink("connecting"));
  client.on("close", () => {
    if (globalRef.__sdlMqttClient) setLink("offline", "การเชื่อมต่อ broker ขาด");
  });
  client.on("error", (error) => setLink("error", error.message));
}

export function publishCmd(payload: Record<string, string>): boolean {
  const client = globalRef.__sdlMqttClient;
  if (!client || !client.connected) return false;
  client.publish(TOPIC_CMD, JSON.stringify(payload), { qos: 1 });
  return true;
}
